
const mongoose = require('mongoose');
const models = require('../models');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');
const { resolvePollingUnit } = require('../utils/geo');
const {
  prepareImage,
  uploadEvidence,
} = require('../services/evidenceService');
const { computeHash } = require('../services/resultHashService');
const { ROLES } = require('../utils/roleScope');
const {
  scopeFilter,
  assertCanAccess,
} = require('../middleware/scope');
const collationService = require('../services/collationService');

// ============================================================
// COLLATION INVALIDATION
// ============================================================

function invalidateCollation(result, actorId, context) {
  collationService
    .rebuildForResult(result, actorId)
    .catch((err) => {
      console.error(
        `[collation] ${context} invalidation failed:`,
        err.message
      );
    });
}

// ============================================================
// PARTY ACCESS CONFIGURATION
// ============================================================

// All roles except PARTY_ADMIN can access votes across parties,
// subject to their geographical permissions.
const CROSS_PARTY_ROLES = new Set([
  ROLES.NATIONAL_SUPER_ADMIN,
  ROLES.STATE_ADMIN,
  ROLES.LGA_ADMIN,
  ROLES.WARD_ADMIN,
  ROLES.POLLING_UNIT_AGENT,
  ROLES.OBSERVER,
]);

// Party Admins can only see their own party's votes.
function sanitizePartyVotes(result, user) {
  if (!result || !result.partyVotes) return result;

  if (CROSS_PARTY_ROLES.has(user.role)) {
    return result;
  }

  if (user.role === ROLES.PARTY_ADMIN) {
    const userParty = user.scope?.party
      ? user.scope.party.toString()
      : null;

    if (!userParty) {
      result.partyVotes = [];
      return result;
    }

    result.partyVotes = result.partyVotes.filter(
      (pv) => pv.party?.toString() === userParty
    );
  }

  return result;
}

// ============================================================
// SUBMIT RESULT
// Only Polling Unit Agent and National Super Admin
// ============================================================

async function submit(req, res) {
  const body = req.body;
  const { user, scope } = req;

  // ----------------------------------------------------------
  // 1. ROLE AUTHORIZATION
  // ----------------------------------------------------------

  if (
    ![
      ROLES.POLLING_UNIT_AGENT,
      ROLES.NATIONAL_SUPER_ADMIN,
    ].includes(user.role)
  ) {
    throw ApiError.forbidden(
      'Only polling unit agents and National Super Admin can submit results'
    );
  }

  // ----------------------------------------------------------
  // 2. POLLING UNIT OWNERSHIP
  // ----------------------------------------------------------

  if (user.role === ROLES.POLLING_UNIT_AGENT) {
    if (
      !scope?.pollingUnit ||
      String(scope.pollingUnit) !== String(body.pollingUnit)
    ) {
      throw ApiError.forbidden(
        'You may only submit results for your assigned polling unit'
      );
    }
  }

  // IMPORTANT:
  // Polling Unit Agents do not need a party assigned.
  // They submit votes for all parties participating in the election.

  // ----------------------------------------------------------
  // 3. REQUIRED FIELDS
  // ----------------------------------------------------------

  if (!body.election) {
    throw ApiError.badRequest('Election is required');
  }

  if (!body.pollingUnit) {
    throw ApiError.badRequest('Polling Unit is required');
  }

  if (!body.idempotencyKey) {
    throw ApiError.badRequest('Idempotency key is required');
  }

  if (!Array.isArray(body.partyVotes) || body.partyVotes.length === 0) {
    throw ApiError.badRequest(
      'At least one party vote entry is required'
    );
  }

  if (!req.file) {
    throw ApiError.badRequest(
      'Evidence photo is required (field: evidence)'
    );
  }

  // ----------------------------------------------------------
  // 4. VALIDATE POLLING UNIT
  // ----------------------------------------------------------

  if (!mongoose.isValidObjectId(body.pollingUnit)) {
    throw ApiError.badRequest('Invalid polling unit ID');
  }

  if (!mongoose.isValidObjectId(body.election)) {
    throw ApiError.badRequest('Invalid election ID');
  }

  const geo = await resolvePollingUnit(body.pollingUnit);

  if (!geo) {
    throw ApiError.badRequest('Polling unit not found');
  }

  // ----------------------------------------------------------
  // 5. VALIDATE ELECTION
  // ----------------------------------------------------------

  const election = await models.Election
    .findById(body.election)
    .lean();

  if (!election) {
    throw ApiError.badRequest('Election not found');
  }

  if (election.status !== 'ACTIVE') {
    throw ApiError.badRequest(
      `Election is ${election.status}; submissions only open when ACTIVE`
    );
  }

  // ----------------------------------------------------------
  // 6. ELECTION GEOGRAPHICAL SCOPE
  // ----------------------------------------------------------

  if (election.scope === 'NATIONAL') {
    // National election: all polling units are eligible.
  } else if (
    election.scope === 'STATE' &&
    election.state &&
    String(election.state) !== String(geo.state)
  ) {
    throw ApiError.forbidden(
      'Election is not active in this state'
    );
  } else if (
    election.scope === 'LGA' &&
    election.lga &&
    String(election.lga) !== String(geo.lga)
  ) {
    throw ApiError.forbidden(
      'Election is not active in this LGA'
    );
  } else if (
    election.scope === 'WARD' &&
    election.ward &&
    String(election.ward) !== String(geo.ward)
  ) {
    throw ApiError.forbidden(
      'Election is not active in this ward'
    );
  }

  // ----------------------------------------------------------
  // 7. IDEMPOTENCY CHECK
  // ----------------------------------------------------------

  // One complete result belongs to one polling unit and election.
  // It is not divided into separate party submissions.

  const existing = await models.Result.findOne({
    election: body.election,
    pollingUnit: body.pollingUnit,
    idempotencyKey: body.idempotencyKey,
  });

  if (existing) {
    return res.status(200).json({
      result: existing.toJSON(),
      idempotentReplay: true,
    });
  }

  // ----------------------------------------------------------
  // 8. VALIDATE VOTE TOTALS
  // ----------------------------------------------------------

  const sumVotes = body.partyVotes.reduce((sum, party) => {
    const votes = Number(party.votes);

    if (!Number.isSafeInteger(votes) || votes < 0) {
      throw ApiError.badRequest(
        'Party votes must be non-negative whole numbers'
      );
    }

    return sum + votes;
  }, 0);

  const registeredVoters = Number(body.registeredVoters);
  const accreditedVoters = Number(body.accreditedVoters);
  const totalVotesCast = Number(body.totalVotesCast);
  const rejectedBallots = Number(body.rejectedBallots || 0);

  const numericValues = [
    registeredVoters,
    accreditedVoters,
    totalVotesCast,
    rejectedBallots,
  ];

  if (
    numericValues.some(
      (value) => !Number.isSafeInteger(value) || value < 0
    )
  ) {
    throw ApiError.badRequest(
      'All voter and ballot totals must be non-negative whole numbers'
    );
  }

  if (accreditedVoters > registeredVoters) {
    throw ApiError.badRequest(
      'accreditedVoters cannot exceed registeredVoters'
    );
  }

  if (sumVotes > totalVotesCast) {
    throw ApiError.badRequest(
      'Sum of party votes cannot exceed totalVotesCast'
    );
  }

  if (totalVotesCast > accreditedVoters + rejectedBallots) {
    throw ApiError.badRequest(
      'totalVotesCast cannot exceed accreditedVoters + rejectedBallots'
    );
  }

  // ----------------------------------------------------------
  // 9. VALIDATE PARTICIPATING PARTIES
  // ----------------------------------------------------------

  const partyIds = body.partyVotes.map((p) => String(p.party));

  if (
    partyIds.some((id) => !mongoose.isValidObjectId(id)) ||
    new Set(partyIds).size !== partyIds.length
  ) {
    throw ApiError.badRequest(
      'Party IDs must be valid and must not be duplicated'
    );
  }

  const partyDocs = await models.Party.find({
    _id: { $in: partyIds },
    isActive: true,
  })
    .select('code')
    .lean();

  if (partyDocs.length !== partyIds.length) {
    throw ApiError.badRequest(
      'One or more parties are unknown or inactive'
    );
  }

  const partyCodeById = new Map(
    partyDocs.map((party) => [
      party._id.toString(),
      party.code,
    ])
  );

  const candidateParties = await models.Candidate.find({
    election: body.election,
    isActive: true,
  }).distinct('party');

  const validPartySet = new Set(
    candidateParties.map((id) => id.toString())
  );

  for (const partyVote of body.partyVotes) {
    if (!validPartySet.has(String(partyVote.party))) {
      throw ApiError.badRequest(
        `Party ${partyCodeById.get(String(partyVote.party))} has no candidate in this election`
      );
    }
  }

  // ----------------------------------------------------------
  // 10. PREPARE AND UPLOAD EVIDENCE
  // ----------------------------------------------------------

  const {
    buffer,
    hash: evidenceHash,
  } = await prepareImage(req.file.buffer);

  const uploaded = await uploadEvidence({
    buffer,
    hash: evidenceHash,
    electionId: body.election,
    pollingUnitCode: geo.puCode,
    idempotencyKey: body.idempotencyKey,
  });

  // ----------------------------------------------------------
  // 11. CREATE RESULT WITH TRANSACTION
  // ----------------------------------------------------------

  const session = await mongoose.startSession();

  let resultDoc;
  let wasRevision = false;
  let previousHash = null;
  let version = 1;

  // This is a complete polling-unit result, not a
  // party-specific result. Therefore party is null.
  const submitterParty = null;

  try {
    await session.withTransaction(async () => {
      const currentFilter = {
        election: body.election,
        pollingUnit: body.pollingUnit,
        isCurrent: true,
      };

      const current = await models.Result.findOne(currentFilter)
        .sort({ version: -1 })
        .session(session)
        .lean();

      wasRevision = !!current;
      version = current ? current.version + 1 : 1;
      previousHash = current?.hash || null;

      resultDoc = new models.Result({
        election: body.election,
        party: submitterParty,

        pollingUnit: body.pollingUnit,

        state: geo.state,
        lga: geo.lga,
        ward: geo.ward,

        stateCode: geo.stateCode,
        lgaCode: geo.lgaCode,
        wardCode: geo.wardCode,
        puCode: geo.puCode,

        path: geo.path,

        registeredVoters,
        accreditedVoters,
        totalVotesCast,
        rejectedBallots,

        totalValidVotes: sumVotes,

        partyVotes: body.partyVotes.map((pv) => ({
          party: pv.party,
          partyCode: partyCodeById.get(String(pv.party)),
          votes: Number(pv.votes),
        })),

        evidence: {
          photoUrl: uploaded.photoUrl,
          photoPublicId: uploaded.photoPublicId,
          photoHash: uploaded.photoHash,
          capturedAt: body.capturedAt
            ? new Date(body.capturedAt)
            : new Date(),
          gps: body.gps,
          deviceId: body.deviceId || null,
        },

        previousHash,
        hash: '',

        version,
        isCurrent: true,
        supersedes: current?._id || null,

        status: 'SUBMITTED',

        submittedBy: user._id,
        submittedAt: new Date(),

        idempotencyKey: body.idempotencyKey,
        notes: body.notes || null,
      });

      resultDoc.hash = computeHash(
        resultDoc,
        previousHash
      );

      if (current) {
        await models.Result.updateOne(
          {
            _id: current._id,
            isCurrent: true,
          },
          {
            $set: {
              isCurrent: false,
              supersededBy: resultDoc._id,
              status: 'SUPERSEDED',
            },
          },
          { session }
        );
      }

      await resultDoc.save({ session });
    });
  } finally {
    await session.endSession();
  }

  // ----------------------------------------------------------
  // 12. AUDIT LOG
  // ----------------------------------------------------------

  await audit.log({
    actor: user._id,
    actorRole: user.role,

    action: wasRevision
      ? 'RESULT_REVISED'
      : 'RESULT_SUBMITTED',

    entity: 'Result',
    entityId: resultDoc._id,

    metadata: {
      election: body.election,
      party: null,
      pollingUnit: body.pollingUnit,
      version,
      totalVotesCast,
      hash: resultDoc.hash,
      previousHash,
    },

    req,
  });

  // ----------------------------------------------------------
  // 13. NOTIFY WARD ADMIN
  // ----------------------------------------------------------

  const wardAdmin = await models.User.findOne({
    role: ROLES.WARD_ADMIN,
    'scope.ward': geo.ward,
    isActive: true,
  })
    .select('_id')
    .lean();

  if (wardAdmin) {
    await models.Notification.create({
      recipient: wardAdmin._id,
      type: 'RESULT_SUBMITTED',
      title: 'New result submitted',

      body: `PU ${geo.puCode} submitted a result for ${election.name}`,

      link: `/results/${resultDoc._id}`,
      refModel: 'Result',
      refId: resultDoc._id,
    });
  }

  // ----------------------------------------------------------
  // 14. INVALIDATE COLLATION
  // ----------------------------------------------------------

  invalidateCollation(
    resultDoc,
    user._id,
    'submit'
  );

  // ----------------------------------------------------------
  // 15. RESPONSE
  // ----------------------------------------------------------

  const payload = resultDoc.toJSON();

  sanitizePartyVotes(payload, user);

  return res.status(201).json({
    message: 'Result submitted successfully',
    result: payload,
  });
}

// ============================================================
// LIST RESULTS
// ============================================================

async function list(req, res) {
  const q = req.query;

  const filter = {
    ...scopeFilter(req),
  };

  // Only Party Admin is restricted to one party.
  if (req.user.role === ROLES.PARTY_ADMIN) {
    const userParty = req.user.scope?.party;

    if (!userParty) {
      throw ApiError.forbidden(
        'Your account has no party scope assigned'
      );
    }

    filter.party = userParty;
  }

  if (q.election) filter.election = q.election;
  if (q.pollingUnit) filter.pollingUnit = q.pollingUnit;
  if (q.status) filter.status = q.status;
  if (q.stateCode) filter.stateCode = q.stateCode.toUpperCase();
  if (q.lgaCode) filter.lgaCode = q.lgaCode;
  if (q.wardCode) filter.wardCode = q.wardCode;

  filter.isCurrent = true;

  if (req.user.role === ROLES.POLLING_UNIT_AGENT) {
    filter.pollingUnit = req.user.scope.pollingUnit;
  }

  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(q.limit, 10) || 50)
  );

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    models.Result.find(filter)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('election', 'name type scope year')
      .populate('pollingUnit', 'code name')
      .populate('party', 'name code abbreviation color')
      .lean(),

    models.Result.countDocuments(filter),
  ]);

  for (const item of items) {
    sanitizePartyVotes(item, req.user);
  }

  return res.json({
    results: items,

    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

// ============================================================
// GET ONE RESULT
// ============================================================

async function getOne(req, res) {
  const result = await models.Result.findById(req.params.id)
    .populate('election', 'name type scope year status')
    .populate('pollingUnit', 'code name address')
    .populate('party', 'name code abbreviation color')
    .populate('submittedBy', 'firstName lastName role')
    .populate('verifiedBy', 'firstName lastName role');

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  assertCanAccess(req, result);

  // Party Admin can only access their own party's result.
  if (req.user.role === ROLES.PARTY_ADMIN) {
    const userParty = req.user.scope?.party;

    if (
      !userParty ||
      !result.party ||
      result.party.toString() !== userParty.toString()
    ) {
      throw ApiError.forbidden(
        'You do not have access to this result'
      );
    }
  }

  const payload = result.toJSON();

  sanitizePartyVotes(payload, req.user);

  return res.json({
    result: payload,
  });
}

// ============================================================
// VERIFY RESULT
// Ward Admin and authorized higher administrators
// ============================================================

async function verify(req, res) {
  const result = await models.Result.findById(req.params.id);

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  assertCanAccess(req, result);

  if (req.user.role === ROLES.PARTY_ADMIN) {
    const userParty = req.user.scope?.party;

    if (
      !userParty ||
      !result.party ||
      result.party.toString() !== userParty.toString()
    ) {
      throw ApiError.forbidden(
        'You cannot verify results for another party'
      );
    }
  }

  if (result.status !== 'SUBMITTED') {
    throw ApiError.badRequest(
      `Cannot verify a result in status ${result.status}`
    );
  }

  if (!result.isCurrent) {
    throw ApiError.badRequest(
      'Cannot verify a superseded result'
    );
  }

  const partySum = result.partyVotes.reduce(
    (sum, party) => sum + party.votes,
    0
  );

  result.totalValidVotes = partySum;
  result.totalVotesCast =
    partySum + (result.rejectedBallots || 0);

  if (result.totalVotesCast > result.accreditedVoters) {
    result.accreditedVoters = result.totalVotesCast;
  }

  result.status = 'VERIFIED';
  result.verifiedBy = req.user._id;
  result.verifiedAt = new Date();

  if (req.body.notes) {
    result.notes = req.body.notes;
  }

  await result.save();

  await audit.log({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'RESULT_VERIFIED',
    entity: 'Result',
    entityId: result._id,

    metadata: {
      election: result.election,
      party: result.party,
      puCode: result.puCode,
    },

    req,
  });

  await models.Notification.create({
    recipient: result.submittedBy,
    type: 'RESULT_VERIFIED',
    title: 'Your result was verified',
    body: `Result for PU ${result.puCode} was verified`,
    link: `/results/${result._id}`,
    refModel: 'Result',
    refId: result._id,
    severity: 'success',
  });

  invalidateCollation(
    result,
    req.user._id,
    'verify'
  );

  const payload = result.toJSON();

  sanitizePartyVotes(payload, req.user);

  return res.json({
    result: payload,
  });
}

// ============================================================
// FLAG RESULT
// ============================================================

async function flag(req, res) {
  const result = await models.Result.findById(req.params.id);

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  assertCanAccess(req, result);

  if (req.user.role === ROLES.PARTY_ADMIN) {
    const userParty = req.user.scope?.party;

    if (
      !userParty ||
      !result.party ||
      result.party.toString() !== userParty.toString()
    ) {
      throw ApiError.forbidden(
        'You cannot flag results for another party'
      );
    }
  }

  if (!['SUBMITTED', 'VERIFIED'].includes(result.status)) {
    throw ApiError.badRequest(
      `Cannot flag a result in status ${result.status}`
    );
  }

  const wasVerified = result.status === 'VERIFIED';

  result.status = 'FLAGGED';
  result.flagReason = req.body.reason;

  await result.save();

  await audit.log({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'RESULT_FLAGGED',
    entity: 'Result',
    entityId: result._id,

    metadata: {
      reason: req.body.reason,
      previousStatus: wasVerified
        ? 'VERIFIED'
        : 'SUBMITTED',
    },

    req,
    severity: 'warning',
  });

  await models.Notification.create({
    recipient: result.submittedBy,
    type: 'RESULT_FLAGGED',
    title: 'Your result was flagged',
    body: req.body.reason,
    link: `/results/${result._id}`,
    refModel: 'Result',
    refId: result._id,
    severity: 'warning',
  });

  invalidateCollation(
    result,
    req.user._id,
    'flag'
  );

  const payload = result.toJSON();

  sanitizePartyVotes(payload, req.user);

  return res.json({
    result: payload,
  });
}

// ============================================================
// REJECT RESULT
// ============================================================

async function reject(req, res) {
  const result = await models.Result.findById(req.params.id);

  if (!result) {
    throw ApiError.notFound('Result not found');
  }

  assertCanAccess(req, result);

  if (req.user.role === ROLES.PARTY_ADMIN) {
    const userParty = req.user.scope?.party;

    if (
      !userParty ||
      !result.party ||
      result.party.toString() !== userParty.toString()
    ) {
      throw ApiError.forbidden(
        'You cannot reject results for another party'
      );
    }
  }

  if (
    ['REJECTED', 'SUPERSEDED'].includes(result.status)
  ) {
    throw ApiError.badRequest(
      `Cannot reject a result in status ${result.status}`
    );
  }

  const previousStatus = result.status;

  result.status = 'REJECTED';
  result.rejectReason = req.body.reason;

  await result.save();

  await audit.log({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'RESULT_REJECTED',
    entity: 'Result',
    entityId: result._id,

    metadata: {
      reason: req.body.reason,
      previousStatus,
    },

    req,
    severity: 'warning',
  });

  await models.Notification.create({
    recipient: result.submittedBy,
    type: 'RESULT_REJECTED',
    title: 'Your result was rejected',
    body: req.body.reason,
    link: `/results/${result._id}`,
    refModel: 'Result',
    refId: result._id,
    severity: 'critical',
  });

  invalidateCollation(
    result,
    req.user._id,
    'reject'
  );

  const payload = result.toJSON();

  sanitizePartyVotes(payload, req.user);

  return res.json({
    result: payload,
  });
}

// ============================================================
// EXPORT CONTROLLERS
// ============================================================

module.exports = {
  submit,
  list,
  getOne,
  verify,
  flag,
  reject,
};
