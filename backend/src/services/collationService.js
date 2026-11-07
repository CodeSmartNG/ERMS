
const mongoose = require('mongoose');
const crypto = require('crypto');

const models = require('../models');

const {
  Result,
  PollingUnit,
  Ward,
  LGA,
  State,
  Collation,
} = models;

const VERIFIED_STATUS = 'VERIFIED';

const REPORTED_STATUSES = [
  'SUBMITTED',
  'VERIFIED',
  'FLAGGED',
  'REJECTED',
];

// Prevent simultaneous rebuilds for the same election.
const electionLocks = new Map();

/* =====================================================
   GENERAL HELPERS
===================================================== */

function toObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid MongoDB ObjectId');
  }

  return new mongoose.Types.ObjectId(id);
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sumField(items, field) {
  return items.reduce(
    (total, item) => total + (Number(item[field]) || 0),
    0
  );
}

function createSourceHash(hashes) {
  const sorted = hashes
    .filter(Boolean)
    .map(String)
    .sort();

  return crypto
    .createHash('sha256')
    .update(sorted.join('|'))
    .digest('hex');
}

function normalizePartyTotals(items) {
  const totals = new Map();

  for (const item of items || []) {
    const partyId = item.party
      ? String(item.party._id || item.party)
      : null;

    if (!partyId) continue;

    const partyCode = String(
      item.partyCode || ''
    ).toUpperCase();

    const key = partyId;

    if (!totals.has(key)) {
      totals.set(key, {
        party: partyId,
        partyCode,
        votes: 0,
      });
    }

    totals.get(key).votes += Number(item.votes) || 0;
  }

  return Array.from(totals.values())
    .map((item) => ({
      ...item,
      votes: Math.round(item.votes),
    }))
    .sort((a, b) => b.votes - a.votes);
}

function buildLeadingParty(partyTotals, totalValidVotes) {
  if (!partyTotals || !partyTotals.length) {
    return null;
  }

  const sorted = [...partyTotals].sort((a, b) => b.votes - a.votes);
  const winner = sorted[0];

  return {
    party: winner.party,
    partyCode: winner.partyCode, // <--- MUST BE partyCode
    votes: winner.votes,
    percentage: totalValidVotes > 0
      ? round((winner.votes / totalValidVotes) * 100)
      : 0,
  };
}

function buildCommon(data, pollingUnitsTotal) {
  const reported = Number(data.pollingUnitsReported) || 0;
  const verified = Number(data.pollingUnitsVerified) || 0;

  return {
    registeredVoters: Number(data.registeredVoters) || 0,
    accreditedVoters: Number(data.accreditedVoters) || 0,
    totalVotesCast: Number(data.totalVotesCast) || 0,
    totalValidVotes: Number(data.totalValidVotes) || 0,
    rejectedBallots: Number(data.rejectedBallots) || 0,

    pollingUnitsTotal: Number(pollingUnitsTotal) || 0,
    pollingUnitsReported: reported,
    pollingUnitsVerified: verified,

    reportingPercentage: pollingUnitsTotal > 0
      ? round((reported / pollingUnitsTotal) * 100)
      : 0,
  };
}

function combineCollations(collations, pollingUnitsTotal) {
  const partyItems = [];

  for (const collation of collations) {
    for (const party of collation.partyTotals || []) {
      partyItems.push({
        party: party.party,
        partyCode: party.partyCode,
        votes: party.votes,
      });
    }
  }

  const partyTotals = normalizePartyTotals(partyItems);

  const registeredVoters = sumField(collations, 'registeredVoters');
  const accreditedVoters = sumField(collations, 'accreditedVoters');
  const totalVotesCast = sumField(collations, 'totalVotesCast');
  const totalValidVotes = sumField(collations, 'totalValidVotes');
  const rejectedBallots = sumField(collations, 'rejectedBallots');
  const pollingUnitsReported = sumField(collations, 'pollingUnitsReported');
  const pollingUnitsVerified = sumField(collations, 'pollingUnitsVerified');
  const sourceCount = sumField(collations, 'sourceCount');

  const hashes = collations.map((item) => item.sourceHash);

  return {
    partyTotals,
    ...buildCommon(
      {
        registeredVoters,
        accreditedVoters,
        totalVotesCast,
        totalValidVotes,
        rejectedBallots,
        pollingUnitsReported,
        pollingUnitsVerified,
      },
      pollingUnitsTotal
    ),
    sourceHash: createSourceHash(hashes),
    sourceCount, // <--- ADDED THIS LINE
  };
}

async function withElectionLock(electionId, callback) {
  const key = String(electionId);

  const previous = electionLocks.get(key) || Promise.resolve();

  const current = previous
    .catch(() => {})
    .then(callback);

  electionLocks.set(key, current);

  try {
    return await current;
  } finally {
    if (electionLocks.get(key) === current) {
      electionLocks.delete(key);
    }
  }
}

/* =====================================================
   SOURCE DATA: WARD
===================================================== */

async function computeWard(electionId, wardId) {
  const ward = await Ward.findById(wardId).lean();

  if (!ward) {
    throw new Error(`Ward not found: ${wardId}`);
  }

  const lga = await LGA.findById(ward.lga).lean();

  if (!lga) {
    throw new Error(`LGA not found for ward: ${wardId}`);
  }

  const state = await State.findById(lga.state).lean();

  if (!state) {
    throw new Error(`State not found for ward: ${wardId}`);
  }

  // Only VERIFIED current results contribute to vote totals.
  const verifiedResults = await Result.find({
    election: electionId,
    ward: wardId,
    isCurrent: true,
    status: VERIFIED_STATUS,
  })
    .select(
      'registeredVoters accreditedVoters totalVotesCast totalValidVotes rejectedBallots partyVotes hash'
    )
    .lean();

  // All current submitted reports count towards reported coverage.
  const pollingUnitsReported = await Result.countDocuments({
    election: electionId,
    ward: wardId,
    isCurrent: true,
    status: { $in: REPORTED_STATUSES },
  });

  const pollingUnitsVerified = verifiedResults.length;

  const pollingUnitsTotal = await PollingUnit.countDocuments({
    ward: wardId,
    isActive: true,
  });

  if (!verifiedResults.length) {
    return null;
  }

  const partyItems = [];

  for (const result of verifiedResults) {
    for (const item of result.partyVotes || []) {
      partyItems.push({
        party: item.party,
        partyCode: item.partyCode,
        votes: item.votes,
      });
    }
  }

  const partyTotals = normalizePartyTotals(partyItems);

  const registeredVoters = sumField(
    verifiedResults,
    'registeredVoters'
  );

  const accreditedVoters = sumField(
    verifiedResults,
    'accreditedVoters'
  );

  const totalVotesCast = sumField(
    verifiedResults,
    'totalVotesCast'
  );

  const totalValidVotes = sumField(
    verifiedResults,
    'totalValidVotes'
  );

  const rejectedBallots = sumField(
    verifiedResults,
    'rejectedBallots'
  );

  const sourceHash = createSourceHash(
    verifiedResults.map((item) => item.hash)
  );

  return {
    election: electionId,
    level: 'WARD',
    entity: ward._id,
    entityCode: ward.code,
    entityName: ward.name,

    stateCode: state.code,
    stateName: state.name,

    lgaCode: lga.code,
    lgaName: lga.name,

    wardCode: ward.code,
    wardName: ward.name,

    partyTotals,

    ...buildCommon(
      {
        registeredVoters,
        accreditedVoters,
        totalVotesCast,
        totalValidVotes,
        rejectedBallots,
        pollingUnitsReported,
        pollingUnitsVerified,
      },
      pollingUnitsTotal
    ),

    sourceHash,
    sourceCount: verifiedResults.length,
  };
}

/* =====================================================
   SOURCE DATA: LGA
===================================================== */

async function computeLGA(electionId, lgaId) {
  const lga = await LGA.findById(lgaId).lean();

  if (!lga) {
    throw new Error(`LGA not found: ${lgaId}`);
  }

  const state = await State.findById(lga.state).lean();

  if (!state) {
    throw new Error(`State not found for LGA: ${lgaId}`);
  }

  const wardCollations = await Collation.find({
    election: electionId,
    level: 'WARD',
    lgaCode: lga.code,
    stateCode: state.code,
    isCurrent: true,
  }).lean();

  if (!wardCollations.length) {
    return null;
  }

  const pollingUnitsTotal = await PollingUnit.countDocuments({
    lga: lgaId,
    isActive: true,
  });

  const common = combineCollations(
    wardCollations,
    pollingUnitsTotal
  );

  return {
    election: electionId,
    level: 'LGA',
    entity: lga._id,
    entityCode: lga.code,
    entityName: lga.name,

    stateCode: state.code,
    stateName: state.name,

    lgaCode: lga.code,
    lgaName: lga.name,

    wardCode: null,
    wardName: null,

    ...common,
  };
}

/* =====================================================
   SOURCE DATA: STATE
===================================================== */

async function computeState(electionId, stateId) {
  const state = await State.findById(stateId).lean();

  if (!state) {
    throw new Error(`State not found: ${stateId}`);
  }

  const lgaCollations = await Collation.find({
    election: electionId,
    level: 'LGA',
    stateCode: state.code,
    isCurrent: true,
  }).lean();

  if (!lgaCollations.length) {
    return null;
  }

  const pollingUnitsTotal = await PollingUnit.countDocuments({
    state: stateId,
    isActive: true,
  });

  const common = combineCollations(
    lgaCollations,
    pollingUnitsTotal
  );

  return {
    election: electionId,
    level: 'STATE',
    entity: state._id,
    entityCode: state.code,
    entityName: state.name,

    stateCode: state.code,
    stateName: state.name,

    lgaCode: null,
    lgaName: null,

    wardCode: null,
    wardName: null,

    ...common,
  };
}

/* =====================================================
   SOURCE DATA: NATIONAL
===================================================== */

async function computeNational(electionId) {
  const stateCollations = await Collation.find({
    election: electionId,
    level: 'STATE',
    isCurrent: true,
  }).lean();

  if (!stateCollations.length) {
    return null;
  }

  // Assumes the PollingUnit collection contains only the
  // geographical coverage included in this election.
  const pollingUnitsTotal = await PollingUnit.countDocuments({
    isActive: true,
  });

  const common = combineCollations(
    stateCollations,
    pollingUnitsTotal
  );

  return {
    election: electionId,
    level: 'NATIONAL',
    entity: null,
    entityCode: 'NATIONAL',
    entityName: 'National',

    stateCode: null,
    stateName: null,

    lgaCode: null,
    lgaName: null,

    wardCode: null,
    wardName: null,

    ...common,
  };
}

/* =====================================================
   COMPUTE LEVEL
===================================================== */

async function computeLevel(electionId, level, entityId) {
  switch (level) {
    case 'WARD':
      return computeWard(electionId, entityId);

    case 'LGA':
      return computeLGA(electionId, entityId);

    case 'STATE':
      return computeState(electionId, entityId);

    case 'NATIONAL':
      return computeNational(electionId);

    default:
      throw new Error(`Unsupported collation level: ${level}`);
  }
}

/* =====================================================
   SAVE / REPLACE COLLATION
===================================================== */

async function retireCurrentCollation(
  electionId,
  level,
  entityId
) {
  const filter = {
    election: electionId,
    level,
    isCurrent: true,
  };

  filter.entity = level === 'NATIONAL'
    ? null
    : entityId;

  await Collation.updateMany(
    filter,
    {
      $set: {
        isCurrent: false,
      },
    }
  );
}

async function rebuildLevel(
  electionId,
  level,
  entityId,
  actorId
) {
  electionId = toObjectId(electionId);

  if (level !== 'NATIONAL') {
    entityId = toObjectId(entityId);
  } else {
    entityId = null;
  }

  const payload = await computeLevel(
    electionId,
    level,
    entityId
  );

  // No verified source data: retire any old current record.
  if (!payload) {
    await retireCurrentCollation(
      electionId,
      level,
      entityId
    );

    return {
      success: true,
      level,
      empty: true,
      message: 'No verified source data for this collation.',
    };
  }

  const session = await mongoose.startSession();

  let savedCollation;

  try {
    await session.withTransaction(async () => {
      const filter = {
        election: electionId,
        level,
      };

      filter.entity = level === 'NATIONAL'
        ? null
        : entityId;

      // Read the latest historical version, not just the
      // current document. This preserves version history
      // during full rebuilds.
      const previous = await Collation.findOne(filter)
        .sort({ version: -1 })
        .session(session)
        .lean();

      const nextVersion = (previous?.version || 0) + 1;

      await Collation.updateMany(
        {
          ...filter,
          isCurrent: true,
        },
        {
          $set: {
            isCurrent: false,
          },
        },
        { session }
      );

      const leadingParty = buildLeadingParty(
        payload.partyTotals,
        payload.totalValidVotes
      );

      const documents = await Collation.create(
        [
          {
            ...payload,

            leadingParty,

            // Generated collations are not drafts.
            // Verification and publication remain separate steps.
            status: 'COLLATED',

            collatedBy: actorId || null,
            collatedAt: new Date(),

            version: nextVersion,
            isCurrent: true,
          },
        ],
        { session }
      );

      savedCollation = documents[0];
    });

    return {
      success: true,
      level,
      version: savedCollation.version,
      collation: savedCollation,
    };
  } finally {
    await session.endSession();
  }
}

/* =====================================================
   RESULT CHANGE CASCADE
===================================================== */

async function rebuildForResult(result, actorId) {
  if (!result) {
    throw new Error('Result is required for collation rebuild');
  }

  const electionId = toObjectId(result.election);

  const wardId = toObjectId(result.ward);
  const lgaId = toObjectId(result.lga);
  const stateId = toObjectId(result.state);

  return withElectionLock(electionId, async () => {
    // IMPORTANT: Always rebuild from the bottom upwards.
    // Higher levels must read the newly saved lower levels.

    const wardResult = await rebuildLevel(
      electionId,
      'WARD',
      wardId,
      actorId
    );

    const lgaResult = await rebuildLevel(
      electionId,
      'LGA',
      lgaId,
      actorId
    );

    const stateResult = await rebuildLevel(
      electionId,
      'STATE',
      stateId,
      actorId
    );

    const nationalResult = await rebuildLevel(
      electionId,
      'NATIONAL',
      null,
      actorId
    );

    return {
      success: true,
      electionId,
      rebuilt: {
        ward: wardResult,
        lga: lgaResult,
        state: stateResult,
        national: nationalResult,
      },
    };
  });
}

/* =====================================================
   FULL ELECTION REBUILD
===================================================== */


    async function rebuildAllForElection(electionId, actorId) {
  electionId = toObjectId(electionId);

  return withElectionLock(electionId, async () => {
    console.log(`[COLLATION] Starting full rebuild for election ${electionId}`);

    // ONLY fetch entities that actually have VERIFIED results
    const wards = await Result.distinct('ward', { election: electionId, isCurrent: true, status: VERIFIED_STATUS });
    const lgas = await Result.distinct('lga', { election: electionId, isCurrent: true, status: VERIFIED_STATUS });
    const states = await Result.distinct('state', { election: electionId, isCurrent: true, status: VERIFIED_STATUS });

    let wardCount = 0;
    let lgaCount = 0;
    let stateCount = 0;

    // 1. Rebuild only the wards that have results
    for (const wardId of wards) {
      await rebuildLevel(electionId, 'WARD', wardId, actorId);
      wardCount++;
    }

    // 2. Rebuild only the LGAs that have results
    for (const lgaId of lgas) {
      await rebuildLevel(electionId, 'LGA', lgaId, actorId);
      lgaCount++;
    }

    // 3. Rebuild only the states that have results
    for (const stateId of states) {
      await rebuildLevel(electionId, 'STATE', stateId, actorId);
      stateCount++;
    }

    // 4. Rebuild national last
    const national = await rebuildLevel(electionId, 'NATIONAL', null, actorId);

    console.log(`[COLLATION] Completed rebuild for election ${electionId}`);

    return {
      success: true,
      electionId,
      counts: { wards: wardCount, lgas: lgaCount, states: stateCount },
      national,
    };
  });
}


/* =====================================================
   VERIFY COLLATION SOURCE
===================================================== */

async function verifyCollation(collationId) {
  const collation = await Collation.findById(collationId).lean();

  if (!collation) {
    throw new Error('Collation not found');
  }

  const freshPayload = await computeLevel(
    collation.election,
    collation.level,
    collation.entity
  );

  if (!freshPayload) {
    return {
      valid: false,
      message: 'No verified source data exists for this collation.',
      storedHash: collation.sourceHash,
      currentHash: null,
    };
  }

  const valid = collation.sourceHash === freshPayload.sourceHash;

  return {
    valid,
    message: valid
      ? 'Collation source is up to date.'
      : 'Source data has changed. Rebuild this collation.',
    storedHash: collation.sourceHash,
    currentHash: freshPayload.sourceHash,
  };
}

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {
  rebuildForResult,
  rebuildLevel,
  rebuildAllForElection,
  verifyCollation,
  computeLevel,
};
