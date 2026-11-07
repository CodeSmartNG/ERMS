const mongoose = require('mongoose');
const models = require('../models');

const { Result, PollingUnit, Ward, LGA, State, Collation } = models;

// ---------------------------------------------------------------
// Debounce queue — batch rebuilds during election-night bursts.
// Key = `${electionId}:${level}:${entityId || 'NATIONAL'}`
// ---------------------------------------------------------------
const pending = new Map();
const timers = new Map();
const DEBOUNCE_MS = 2000;

function enqueue(level, electionId, entityId, actorId) {
  const key = `${electionId}:${level}:${entityId || 'NATIONAL'}`;
  pending.set(key, { level, electionId, entityId, actorId, queuedAt: Date.now() });

  if (timers.has(key)) return;
  const t = setTimeout(
    () =>
      flushOne(key).catch((e) =>
        console.error(`[collation] flush ${key} failed:`, e)
      ),
    DEBOUNCE_MS
  );
  timers.set(key, t);
}

async function flushOne(key) {
  timers.delete(key);
  const job = pending.get(key);
  pending.delete(key);
  if (!job) return;
  await rebuildLevel(job.electionId, job.level, job.entityId, job.actorId);
}

/** Drain all pending rebuilds (used by tests and SIGTERM handler). */
async function flush() {
  const keys = [...pending.keys()];
  for (const k of keys) {
    if (timers.has(k)) clearTimeout(timers.get(k));
    await flushOne(k);
  }
}

// ---------------------------------------------------------------
// Public API — one entry point per level.
// ---------------------------------------------------------------

/**
 * Called by resultController after verify/flag/reject/revise.
 * Cascades rebuilds up the tree: ward → lga → state → national.
 */
async function rebuildForResult(result, actorId = null) {
  const electionId = result.election;

  enqueue('WARD', electionId, result.ward, actorId);
  enqueue('LGA', electionId, result.lga, actorId);
  enqueue('STATE', electionId, result.state, actorId);
  enqueue('NATIONAL', electionId, null, actorId);
}

/**
 * Recompute a single collation document. All persistence goes through here.
 * Returns the new Collation doc, or null if the entity has no source data.
 */
async function rebuildLevel(electionId, level, entityId, actorId = null) {
  const payload = await computeLevel(electionId, level, entityId);

  if (!payload) {
    // No source data — retire any current doc so dashboards don't show
    // stale numbers for an entity that has nothing to report anymore.
    const retired = await Collation.updateMany(
      { election: electionId, level, entity: entityId || null, isCurrent: true },
      { $set: { isCurrent: false } }
    );
    if (retired.modifiedCount > 0) {
      console.log(
        `[collation] retired stale ${level} collation for ${entityId || 'NATIONAL'} ` +
        `(no source data)`
      );
    }
    return null;
  }

  const session = await mongoose.startSession();
  let newDoc;
  try {
    await session.withTransaction(async () => {
      // Retire the previous current version, if any
      const previous = await Collation.findOne({
        election: electionId,
        level,
        entity: entityId || null,
        isCurrent: true,
      })
        .session(session)
        .lean();

      if (previous) {
        await Collation.updateOne(
          { _id: previous._id },
          { $set: { isCurrent: false } },
          { session }
        );
      }

      newDoc = await Collation.create(
        [
          {
            election: electionId,
            level,
            entity: entityId || null,
            entityCode: payload.entityCode,

            // Denormalized names
            entityName: payload.entityName || null,
            stateName: payload.stateName || null,
            lgaName: payload.lgaName || null,
            wardName: payload.wardName || null,

            stateCode: payload.stateCode,
            lgaCode: payload.lgaCode,
            wardCode: payload.wardCode,

            // NEW: Set status to VERIFIED so dashboards pick it up
            status: 'VERIFIED', 

            partyTotals: payload.partyTotals,

            // Pre-computed leader — eliminates a sort on every dashboard read
            leadingParty: Collation.buildLeadingParty(
              payload.partyTotals,
              payload.totalValidVotes
            ),

            registeredVoters: payload.registeredVoters,
            accreditedVoters: payload.accreditedVoters,
            totalVotesCast: payload.totalVotesCast,
            totalValidVotes: payload.totalValidVotes,
            rejectedBallots: payload.rejectedBallots,

            pollingUnitsTotal: payload.pollingUnitsTotal,
            pollingUnitsReported: payload.pollingUnitsReported,
            pollingUnitsVerified: payload.pollingUnitsVerified,

            // Quality flags for the dashboard
            dataIssues: Collation.detectDataIssues(payload),

            sourceHash: payload.sourceHash,
            sourceCount: payload.sourceCount,

            collatedBy: actorId,
            version: (previous?.version ?? 0) + 1,
            isCurrent: true,
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return newDoc[0];
}

// ---------------------------------------------------------------
// Compute — the aggregation pipelines.
// ---------------------------------------------------------------

/**
 * Returns the payload for one collation level, computed from source.
 * Returns null if there's no source data (don't create empty collations).
 */
async function computeLevel(electionId, level, entityId) {
  switch (level) {
    case 'WARD':     return computeWard(electionId, entityId);
    case 'LGA':      return computeLGA(electionId, entityId);
    case 'STATE':    return computeState(electionId, entityId);
    case 'NATIONAL': return computeNational(electionId);
    default: throw new Error(`Unknown level: ${level}`);
  }
}

// ---- WARD: from VERIFIED results at this ward ----
async function computeWard(electionId, wardId) {
  const ward = await Ward.findById(wardId).lean();
  if (!ward) return null;

  const [agg, puTotal, state, lga] = await Promise.all([
    Result.aggregate([
      { $match: { election: electionId, ward: wardId, isCurrent: true, status: 'VERIFIED' } },
      {
        $group: {
          _id: null,
          registeredVoters: { $sum: '$registeredVoters' },
          accreditedVoters: { $sum: '$accreditedVoters' },
          totalVotesCast: { $sum: '$totalVotesCast' },
          totalValidVotes: { $sum: '$totalValidVotes' },
          rejectedBallots: { $sum: '$rejectedBallots' },
          partyTotals: { $push: '$partyVotes' },
          hashes: { $push: '$hash' },
          count: { $sum: 1 },
        },
      },
    ]),
    PollingUnit.countDocuments({ ward: wardId, isActive: true }),
    State.findById(ward.state).select('name code').lean(),
    LGA.findById(ward.lga).select('name code').lean(),
  ]);

  if (!agg.length) return null;
  const data = agg[0];

  return {
    entityCode: ward.code,
    entityName: ward.name,
    stateName: state?.name || null,
    lgaName: lga?.name || null,
    wardName: ward.name,
    stateCode: ward.stateCode,
    lgaCode: ward.lgaCode,
    wardCode: ward.code,
    ...buildCommon(data, puTotal),
  };
}

// ---- LGA: from current WARD collations under this LGA ----
async function computeLGA(electionId, lgaId) {
  const lga = await LGA.findById(lgaId).lean();
  if (!lga) return null;

  const [partyAgg, metaAgg, puTotal, state] = await Promise.all([
    Collation.aggregate([
      {
        $match: {
          election: electionId,
          level: 'WARD',
          lgaCode: lga.code,
          isCurrent: true,
        },
      },
      { $unwind: '$partyTotals' },
      {
        $group: {
          _id: '$partyTotals.party',
          partyCode: { $first: '$partyTotals.partyCode' },
          votes: { $sum: '$partyTotals.votes' },
        },
      },
      { $sort: { votes: -1 } },
    ]),
    Collation.aggregate([
      {
        $match: {
          election: electionId,
          level: 'WARD',
          lgaCode: lga.code,
          isCurrent: true,
        },
      },
      {
        $group: {
          _id: null,
          registeredVoters: { $sum: '$registeredVoters' },
          accreditedVoters: { $sum: '$accreditedVoters' },
          totalVotesCast: { $sum: '$totalVotesCast' },
          totalValidVotes: { $sum: '$totalValidVotes' },
          rejectedBallots: { $sum: '$rejectedBallots' },
          pollingUnitsReported: { $sum: '$pollingUnitsReported' },
          pollingUnitsVerified: { $sum: '$pollingUnitsVerified' },
          sourceHashes: { $push: '$sourceHash' },
        },
      },
    ]),
    PollingUnit.countDocuments({ lga: lgaId, isActive: true }),
    State.findById(lga.state).select('name code').lean(),
  ]);

  if (!metaAgg.length) return null;
  const meta = metaAgg[0];

  return {
    entityCode: lga.code,
    entityName: lga.name,
    stateName: state?.name || null,
    lgaName: lga.name,
    wardName: null,
    stateCode: lga.stateCode,
    lgaCode: lga.code,
    wardCode: null,
    partyTotals: partyAgg.map((p) => ({
      party: p._id,
      partyCode: p.partyCode,
      votes: p.votes,
    })),
    registeredVoters: meta.registeredVoters,
    accreditedVoters: meta.accreditedVoters,
    totalVotesCast: meta.totalVotesCast,
    totalValidVotes: meta.totalValidVotes,
    rejectedBallots: meta.rejectedBallots,
    pollingUnitsTotal: puTotal,
    pollingUnitsReported: meta.pollingUnitsReported,
    pollingUnitsVerified: meta.pollingUnitsVerified,
    reportingPercentage:
      puTotal > 0 ? round((meta.pollingUnitsReported / puTotal) * 100) : 0,
    sourceHash: Collation.computeSourceHash(meta.sourceHashes.filter(Boolean)),
    sourceCount: meta.pollingUnitsVerified,
  };
}

// ---- STATE: from current LGA collations under this state ----
async function computeState(electionId, stateId) {
  const state = await State.findById(stateId).lean();
  if (!state) return null;

  const [partyAgg, metaAgg, puTotal] = await Promise.all([
    Collation.aggregate([
      {
        $match: {
          election: electionId,
          level: 'LGA',
          stateCode: state.code,
          isCurrent: true,
        },
      },
      { $unwind: '$partyTotals' },
      {
        $group: {
          _id: '$partyTotals.party',
          partyCode: { $first: '$partyTotals.partyCode' },
          votes: { $sum: '$partyTotals.votes' },
        },
      },
      { $sort: { votes: -1 } },
    ]),
    Collation.aggregate([
      {
        $match: {
          election: electionId,
          level: 'LGA',
          stateCode: state.code,
          isCurrent: true,
        },
      },
      {
        $group: {
          _id: null,
          registeredVoters: { $sum: '$registeredVoters' },
          accreditedVoters: { $sum: '$accreditedVoters' },
          totalVotesCast: { $sum: '$totalVotesCast' },
          totalValidVotes: { $sum: '$totalValidVotes' },
          rejectedBallots: { $sum: '$rejectedBallots' },
          pollingUnitsReported: { $sum: '$pollingUnitsReported' },
          pollingUnitsVerified: { $sum: '$pollingUnitsVerified' },
          sourceHashes: { $push: '$sourceHash' },
        },
      },
    ]),
    PollingUnit.countDocuments({ state: stateId, isActive: true }),
  ]);

  if (!metaAgg.length) return null;
  const meta = metaAgg[0];

  return {
    entityCode: state.code,
    entityName: state.name,
    stateName: state.name,
    lgaName: null,
    wardName: null,
    stateCode: state.code,
    lgaCode: null,
    wardCode: null,
    partyTotals: partyAgg.map((p) => ({
      party: p._id,
      partyCode: p.partyCode,
      votes: p.votes,
    })),
    registeredVoters: meta.registeredVoters,
    accreditedVoters: meta.accreditedVoters,
    totalVotesCast: meta.totalVotesCast,
    totalValidVotes: meta.totalValidVotes,
    rejectedBallots: meta.rejectedBallots,
    pollingUnitsTotal: puTotal,
    pollingUnitsReported: meta.pollingUnitsReported,
    pollingUnitsVerified: meta.pollingUnitsVerified,
    reportingPercentage:
      puTotal > 0 ? round((meta.pollingUnitsReported / puTotal) * 100) : 0,
    sourceHash: Collation.computeSourceHash(meta.sourceHashes.filter(Boolean)),
    sourceCount: meta.pollingUnitsVerified,
  };
}

// ---- NATIONAL: from current STATE collations ----
async function computeNational(electionId) {
  const [partyAgg, metaAgg, puTotal] = await Promise.all([
    Collation.aggregate([
      { $match: { election: electionId, level: 'STATE', isCurrent: true } },
      { $unwind: '$partyTotals' },
      {
        $group: {
          _id: '$partyTotals.party',
          partyCode: { $first: '$partyTotals.partyCode' },
          votes: { $sum: '$partyTotals.votes' },
        },
      },
      { $sort: { votes: -1 } },
    ]),
    Collation.aggregate([
      { $match: { election: electionId, level: 'STATE', isCurrent: true } },
      {
        $group: {
          _id: null,
          registeredVoters: { $sum: '$registeredVoters' },
          accreditedVoters: { $sum: '$accreditedVoters' },
          totalVotesCast: { $sum: '$totalVotesCast' },
          totalValidVotes: { $sum: '$totalValidVotes' },
          rejectedBallots: { $sum: '$rejectedBallots' },
          pollingUnitsTotal: { $sum: '$pollingUnitsTotal' },
          pollingUnitsReported: { $sum: '$pollingUnitsReported' },
          pollingUnitsVerified: { $sum: '$pollingUnitsVerified' },
          sourceHashes: { $push: '$sourceHash' },
        },
      },
    ]),
    PollingUnit.countDocuments({ isActive: true }),
  ]);

  if (!metaAgg.length) return null;
  const meta = metaAgg[0];

  return {
    entityCode: null,
    entityName: 'Nigeria',
    stateName: null,
    lgaName: null,
    wardName: null,
    stateCode: null,
    lgaCode: null,
    wardCode: null,
    partyTotals: partyAgg.map((p) => ({
      party: p._id,
      partyCode: p.partyCode,
      votes: p.votes,
    })),
    registeredVoters: meta.registeredVoters,
    accreditedVoters: meta.accreditedVoters,
    totalVotesCast: meta.totalVotesCast,
    totalValidVotes: meta.totalValidVotes,
    rejectedBallots: meta.rejectedBallots,
    pollingUnitsTotal: puTotal,
    pollingUnitsReported: meta.pollingUnitsReported,
    pollingUnitsVerified: meta.pollingUnitsVerified,
    reportingPercentage:
      puTotal > 0 ? round((meta.pollingUnitsReported / puTotal) * 100) : 0,
    sourceHash: Collation.computeSourceHash(meta.sourceHashes.filter(Boolean)),
    sourceCount: meta.pollingUnitsVerified,
  };
}

// ---- helpers ----
function round(n) {
  return Math.round(n * 100) / 100;
}

function buildCommon(data, puTotal) {
  const partyMap = new Map();
  for (const pvArray of data.partyTotals) {
    for (const pv of pvArray) {
      const key = pv.party.toString();
      const existing = partyMap.get(key);
      if (existing) existing.votes += pv.votes;
      else
        partyMap.set(key, {
          party: pv.party,
          partyCode: pv.partyCode,
          votes: pv.votes,
        });
    }
  }
  const partyTotals = [...partyMap.values()].sort((a, b) => b.votes - a.votes);

  return {
    partyTotals,
    registeredVoters: data.registeredVoters,
    accreditedVoters: data.accreditedVoters,
    totalVotesCast: data.totalVotesCast,
    totalValidVotes: data.totalValidVotes,
    rejectedBallots: data.rejectedBallots,
    pollingUnitsTotal: puTotal,
    pollingUnitsReported: data.count,
    pollingUnitsVerified: data.count,
    reportingPercentage: puTotal > 0 ? round((data.count / puTotal) * 100) : 0,
    sourceHash: Collation.computeSourceHash(data.hashes.filter(Boolean)),
    sourceCount: data.count,
  };
}

// ---------------------------------------------------------------
// Full rebuild — used when backfilling or recovering from a bug.
// ---------------------------------------------------------------

async function rebuildAllForElection(electionId, actorId = null) {
  console.log(`[collation] full rebuild starting for election ${electionId}`);

  // Retire everything current (rebuildLevel creates fresh copies)
  await Collation.updateMany(
    { election: electionId, isCurrent: true },
    { $set: { isCurrent: false } }
  );

  // Ward
  const wards = await Result.distinct('ward', {
    election: electionId,
    isCurrent: true,
    status: 'VERIFIED',
  });
  for (const wardId of wards) {
    await rebuildLevel(electionId, 'WARD', wardId, actorId);
  }
  console.log(`[collation] rebuilt ${wards.length} WARD`);

  // LGA
  const lgas = await Result.distinct('lga', {
    election: electionId,
    isCurrent: true,
    status: 'VERIFIED',
  });
  for (const lgaId of lgas) {
    await rebuildLevel(electionId, 'LGA', lgaId, actorId);
  }
  console.log(`[collation] rebuilt ${lgas.length} LGA`);

  // State
  const states = await Result.distinct('state', {
    election: electionId,
    isCurrent: true,
    status: 'VERIFIED',
  });
  for (const stateId of states) {
    await rebuildLevel(electionId, 'STATE', stateId, actorId);
  }
  console.log(`[collation] rebuilt ${states.length} STATE`);

  // National
  await rebuildLevel(electionId, 'NATIONAL', null, actorId);
  console.log(`[collation] rebuilt NATIONAL`);

  console.log(`[collation] full rebuild done`);
}

// ---------------------------------------------------------------
// Verification
// ---------------------------------------------------------------

async function verifyCollation(collationId) {
  const doc = await Collation.findById(collationId).lean();
  if (!doc) throw new Error('Collation not found');

  const fresh = await computeLevel(doc.election, doc.level, doc.entity);
  if (!fresh) {
    return {
      ok: false,
      expected: doc.sourceHash,
      actual: null,
      reason: 'no_source_data',
    };
  }

  return {
    ok: fresh.sourceHash === doc.sourceHash,
    expected: doc.sourceHash,
    actual: fresh.sourceHash,
  };
}

module.exports = {
  rebuildForResult,
  rebuildLevel,
  rebuildAllForElection,
  verifyCollation,
  flush,
  DEBOUNCE_MS,
};
