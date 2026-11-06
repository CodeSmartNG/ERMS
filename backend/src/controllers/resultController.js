const mongoose = require('mongoose');
const models = require('../models');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');
const { resolvePollingUnit } = require('../utils/geo');
const { prepareImage, uploadEvidence } = require('../services/evidenceService');
const { computeHash } = require('../services/resultHashService');
const { ROLES } = require('../utils/roleScope');
const { scopeFilter, assertCanAccess } = require('../middleware/scope');
const collationService = require('../services/collationService');

// Fire-and-forget collation invalidation. Never throws into the request path.
function invalidateCollation(result, actorId, context) {
  collationService
    .rebuildForResult(result, actorId)
    .catch((err) => {
      console.error(`[collation] ${context} invalidation failed:`, err.message);
    });
}

// =================================================================
// SUBMIT (agent only, own PU)
// =================================================================
async function submit(req, res) {
  const body = req.body;
  const { user, scope } = req;

  // --- role gate: only PU agents (and super admin for testing) ---
  if (![ROLES.POLLING_UNIT_AGENT, ROLES.NATIONAL_SUPER_ADMIN].includes(user.role)) {
    throw ApiError.forbidden('Only polling unit agents can submit results');
  }

  // --- PU agent is locked to their own PU ---
  if (user.role === ROLES.POLLING_UNIT_AGENT) {
    if (!scope.pollingUnit || !scope.pollingUnit.equals(body.pollingUnit)) {
      throw ApiError.forbidden('You may only submit results for your assigned polling unit');
    }
  }

  // --- evidence file ---
  if (!req.file) throw ApiError.badRequest('Evidence photo is required (field: evidence)');

  // --- resolve authoritative geo data from PU — never trust client ---
  const geo = await resolvePollingUnit(body.pollingUnit);

  // --- election must exist, be scoped to this PU's state, and be ACTIVE ---
  const election = await models.Election.findById(body.election).lean();
  if (!election) throw ApiError.badRequest('Election not found');
  if (election.status !== 'ACTIVE') {
    throw ApiError.badRequest(`Election is ${election.status}; submissions only open when ACTIVE`);
  }
  if (election.states.length > 0 && !election.states.some((s) => s.equals(geo.state))) {
    throw ApiError.badRequest('Election is not active in this state');
  }

  // --- idempotency: return existing doc if same key already used ---
  const existing = await models.Result.findOne({
    election: body.election,
    idempotencyKey: body.idempotencyKey,
  });
  if (existing) {
    return res.status(200).json({
      result: existing.toJSON(),
      idempotentReplay: true,
    });
  }

  // --- numeric consistency (mirrors the pre-validate hook, but fail fast) ---
  const sumVotes = body.partyVotes.reduce((s, p) => s + p.votes, 0);
  if (sumVotes <= 0) throw ApiError.badRequest('Sum of party votes must be positive');
  if (body.accreditedVoters > body.registeredVoters) {
    throw ApiError.badRequest('accreditedVoters cannot exceed registeredVoters');
  }
  if (sumVotes > body.totalVotesCast) {
    throw ApiError.badRequest('Sum of party votes cannot exceed totalVotesCast');
  }
  if (body.totalVotesCast > body.accreditedVoters + body.rejectedBallots) {
    throw ApiError.badRequest('totalVotesCast cannot exceed accreditedVoters + rejectedBallots');
  }

  // --- validate parties exist & belong to this election's candidates ---
  const partyIds = body.partyVotes.map((p) => p.party);
  const partyDocs = await models.Party.find({ _id: { $in: partyIds }, isActive: true })
    .select('code')
    .lean();
  if (partyDocs.length !== partyIds.length) {
    throw ApiError.badRequest('One or more parties are unknown or inactive');
  }
  const partyCodeById = new Map(partyDocs.map((p) => [p._id.toString(), p.code]));

  const candidateParties = await models.Candidate.find({
    election: body.election,
    isActive: true,
  }).distinct('party');
  const validPartySet = new Set(candidateParties.map(String));
  for (const pv of body.partyVotes) {
    if (!validPartySet.has(pv.party)) {
      throw ApiError.badRequest(
        `Party ${partyCodeById.get(pv.party)} has no candidate in this election`
      );
    }
  }

  // --- prepare + upload evidence (outside transaction, network-bound) ---
  const { buffer, hash: evidenceHash } = await prepareImage(req.file.buffer);
  const uploaded = await uploadEvidence({
    buffer,
    hash: evidenceHash,
    electionId: body.election,
    pollingUnitCode: geo.puCode,
    idempotencyKey: body.idempotencyKey,
  });

  // --- transaction: atomically determine version+previousHash and save ---
  // The `current` lookup MUST be inside the transaction to avoid a race where
  // two concurrent revisions compute the same version, then one fails on the
  // partial unique index {election, pollingUnit, isCurrent:true}.
  const session = await mongoose.startSession();
  let resultDoc;
  let wasRevision = false;
  let previousHash = null;
  let version = 1;

  try {
    await session.withTransaction(async () => {
      const current = await models.Result.findOne({
        election: body.election,
        pollingUnit: body.pollingUnit,
        isCurrent: true,
      })
        .sort({ version: -1 })
        .session(session)
        .lean();

      wasRevision = !!current;
      version = current ? current.version + 1 : 1;
      previousHash = current?.hash || null;

      resultDoc = new models.Result({
        election: body.election,
        pollingUnit: body.pollingUnit,
        state: geo.state,
        lga: geo.lga,
        ward: geo.ward,
        stateCode: geo.stateCode,
        lgaCode: geo.lgaCode,
        wardCode: geo.wardCode,
        puCode: geo.puCode,
        path: geo.path,

        registeredVoters: body.registeredVoters,
        accreditedVoters: body.accreditedVoters,
        totalVotesCast: body.totalVotesCast,
        rejectedBallots: body.rejectedBallots || 0,
        totalValidVotes: sumVotes,
        partyVotes: body.partyVotes.map((pv) => ({
          party: pv.party,
          partyCode: partyCodeById.get(pv.party),
          votes: pv.votes,
        })),

        evidence: {
          photoUrl: uploaded.photoUrl,
          photoPublicId: uploaded.photoPublicId,
          photoHash: uploaded.photoHash,
          capturedAt: body.capturedAt ? new Date(body.capturedAt) : new Date(),
          gps: body.gps,
          deviceId: body.deviceId || null,
        },

        previousHash,
        hash: '', // computed below

        version,
        isCurrent: true,
        supersedes: current?._id || null,

        status: 'SUBMITTED',
        submittedBy: user._id,
        submittedAt: new Date(),
        idempotencyKey: body.idempotencyKey,
        notes: body.notes || null,
      });

      resultDoc.hash = computeHash(resultDoc, previousHash);

if (current) {
  // 1. Hide the old result FIRST
  await models.Result.updateOne(
    { _id: current._id, isCurrent: true },
    { $set: { isCurrent: false, supersededBy: resultDoc._id, status: 'SUPERSEDED' } },
    { session }
  );
}

// 2. Then save the new result
await resultDoc.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await audit.log({
    actor: user._id,
    actorRole: user.role,
    action: wasRevision ? 'RESULT_REVISED' : 'RESULT_SUBMITTED',
    entity: 'Result',
    entityId: resultDoc._id,
    metadata: {
      election: body.election,
      pollingUnit: body.pollingUnit,
      version,
      totalVotesCast: body.totalVotesCast,
      hash: resultDoc.hash,
      previousHash,
    },
    req,
  });

  // --- notify the Ward Admin who owns this ward ---
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
      body: `PU ${geo.puCode} submitted a result for election ${election.code}`,
      link: `/results/${resultDoc._id}`,
      refModel: 'Result',
      refId: resultDoc._id,
    });
  }

  // Invalidate collations up the tree so dashboards reflect the new submission
  // (even before verification — reportingPercentage moves immediately).
  invalidateCollation(resultDoc, user._id, 'submit');

  res.status(201).json({ result: resultDoc.toJSON() });
}

// =================================================================
// LIST (scoped)
// =================================================================
async function list(req, res) {
  const q = req.query;
  const filter = { ...scopeFilter(req) };

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

  const page = q.page || 1;
  const limit = q.limit || 50;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    models.Result.find(filter)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('election', 'code title type')
      .populate('pollingUnit', 'code name')
      .lean(),
    models.Result.countDocuments(filter),
  ]);

  res.json({
    results: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

// =================================================================
// GET ONE (scoped)
// =================================================================
async function getOne(req, res) {
  const result = await models.Result.findById(req.params.id)
    .populate('election', 'code title type status')
    .populate('pollingUnit', 'code name address')
    .populate('submittedBy', 'firstName lastName role')
    .populate('verifiedBy', 'firstName lastName role');

  if (!result) throw ApiError.notFound('Result not found');
  assertCanAccess(req, result);

  res.json({ result: result.toJSON() });
}

// =================================================================
// VERIFY (ward admin and above — only their scope, only SUBMITTED)
// =================================================================
async function verify(req, res) {
  const result = await models.Result.findById(req.params.id);
  if (!result) throw ApiError.notFound('Result not found');
  assertCanAccess(req, result);

  if (result.status !== 'SUBMITTED') {
    throw ApiError.badRequest(`Cannot verify a result in status ${result.status}`);
  }
  if (!result.isCurrent) throw ApiError.badRequest('Cannot verify a superseded result');

  result.status = 'VERIFIED';
  result.verifiedBy = req.user._id;
  result.verifiedAt = new Date();
  if (req.body.notes) result.notes = req.body.notes;
  await result.save();

  await audit.log({
    actor: req.user._id,
    actorRole: req.user.role,
    action: 'RESULT_VERIFIED',
    entity: 'Result',
    entityId: result._id,
    metadata: { election: result.election, puCode: result.puCode },
    req,
  });

  // Notify the submitting agent
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

  // CRITICAL: verification moves votes into the collation tally.
  invalidateCollation(result, req.user._id, 'verify');

  res.json({ result: result.toJSON() });
}

// =================================================================
// FLAG (ward admin and above — SUBMITTED or VERIFIED)
// =================================================================
async function flag(req, res) {
  const result = await models.Result.findById(req.params.id);
  if (!result) throw ApiError.notFound('Result not found');
  assertCanAccess(req, result);

  if (!['SUBMITTED', 'VERIFIED'].includes(result.status)) {
    throw ApiError.badRequest(`Cannot flag a result in status ${result.status}`);
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
    metadata: { reason: req.body.reason, previousStatus: wasVerified ? 'VERIFIED' : 'SUBMITTED' },
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

  // CRITICAL when flagging a previously VERIFIED result: its votes must be
  // removed from the collation tally.
  invalidateCollation(result, req.user._id, 'flag');

  res.json({ result: result.toJSON() });
}

// =================================================================
// REJECT (ward admin and above — terminal)
// =================================================================
async function reject(req, res) {
  const result = await models.Result.findById(req.params.id);
  if (!result) throw ApiError.notFound('Result not found');
  assertCanAccess(req, result);

  if (['REJECTED', 'SUPERSEDED'].includes(result.status)) {
    throw ApiError.badRequest(`Cannot reject a result in status ${result.status}`);
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
    metadata: { reason: req.body.reason, previousStatus },
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

  // If the result was previously VERIFIED, its votes must be removed.
  invalidateCollation(result, req.user._id, 'reject');

  res.json({ result: result.toJSON() });
}

module.exports = { submit, list, getOne, verify, flag, reject };
