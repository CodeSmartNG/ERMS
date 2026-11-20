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
// Helpers — multi-tenant isolation
// =================================================================

// Roles that can see OTHER parties' votes within their scope
const CROSS_PARTY_ROLES = new Set([
  ROLES.NATIONAL_SUPER_ADMIN,
  ROLES.STATE_ADMIN,
  ROLES.OBSERVER,
]);

// Strip other parties' votes for party-scoped roles
function sanitizePartyVotes(result, user) {
  if (!result || !result.partyVotes) return result;
  if (CROSS_PARTY_ROLES.has(user.role)) return result;
  const userParty = user.scope?.party?.toString();
  if (!userParty) return result;
  result.partyVotes = result.partyVotes.filter(
    (pv) => pv.party.toString() === userParty
  );
  return result;
}

// =================================================================
// SUBMIT (agent only, own PU)
// =================================================================
async function submit(req, res) {
  const body = req.body;
  const { user, scope } = req;

  if (![ROLES.POLLING_UNIT_AGENT, ROLES.NATIONAL_SUPER_ADMIN].includes(user.role)) {
    throw ApiError.forbidden('Only polling unit agents can submit results');
  }

  if (user.role === ROLES.POLLING_UNIT_AGENT) {
    if (!scope.pollingUnit || !scope.pollingUnit.equals(body.pollingUnit)) {
      throw ApiError.forbidden('You may only submit results for your assigned polling unit');
    }
    // ⬇️ NEW — agent must have a party assigned
    if (!scope.party) {
      throw ApiError.forbidden('Your account has no party assigned; contact your Ward Admin');
    }
  }

  if (!req.file) throw ApiError.badRequest('Evidence photo is required (field: evidence)');

  const geo = await resolvePollingUnit(body.pollingUnit);

  const election = await models.Election.findById(body.election).lean();
  if (!election) throw ApiError.badRequest('Election not found');
  if (election.status !== 'ACTIVE') {
    throw ApiError.badRequest(`Election is ${election.status}; submissions only open when ACTIVE`);
  }

  // ⬇️ FIXED — use the new Election schema (scope/state/lga/ward), not old `level`
  if (election.scope === 'NATIONAL') {
    // National election — no geo check
  } else if (election.scope === 'STATE' && election.state && !election.state.equals(geo.state)) {
    throw ApiError.badRequest('Election is not active in this state');
  } else if (election.scope === 'LGA' && election.lga && !election.lga.equals(geo.lga)) {
    throw ApiError.badRequest('Election is not active in this LGA');
  } else if (election.scope === 'WARD' && election.ward && !election.ward.equals(geo.ward)) {
    throw ApiError.badRequest('Election is not active in this ward');
  }
  // ⬆️

  // ⬇️ FIXED — idempotency check now includes party
  const submitterParty = user.scope?.party || null;
  const existing = await models.Result.findOne({
    election: body.election,
    idempotencyKey: body.idempotencyKey,
    // Only scope by party if the submitter has one (Super Admin may not)
    ...(submitterParty ? { party: submitterParty } : {}),
  });
  if (existing) {
    return res.status(200).json({ result: existing.toJSON(), idempotentReplay: true });
  }
  // ⬆️

  const sumVotes = body.partyVotes.reduce((s, p) => s + p.votes, 0);
  // ⬇️ CHANGED — allow 0 for boycotted PUs; reject only negative
  if (sumVotes < 0) throw ApiError.badRequest('Sum of party votes cannot be negative');
  // ⬆️
  if (body.accreditedVoters > body.registeredVoters) {
    throw ApiError.badRequest('accreditedVoters cannot exceed registeredVoters');
  }
  if (sumVotes > body.totalVotesCast) {
    throw ApiError.badRequest('Sum of party votes cannot exceed totalVotesCast');
  }
  if (body.totalVotesCast > body.accreditedVoters + body.rejectedBallots) {
    throw ApiError.badRequest('totalVotesCast cannot exceed accreditedVoters + rejectedBallots');
  }

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

  // ⬇️ NEW — agent's own party must have a candidate in this election
  if (user.role === ROLES.POLLING_UNIT_AGENT && submitterParty) {
    if (!validPartySet.has(submitterParty.toString())) {
      throw ApiError.badRequest('Your party has no candidate in this election');
    }
  }
  // ⬆️

  const { buffer, hash: evidenceHash } = await prepareImage(req.file.buffer);
  const uploaded = await uploadEvidence({
    buffer,
    hash: evidenceHash,
    electionId: body.election,
    pollingUnitCode: geo.puCode,
    idempotencyKey: body.idempotencyKey,
  });

  const session = await mongoose.startSession();
  let resultDoc;
  let wasRevision = false;
  let previousHash = null;
  let version = 1;

  try {
    await session.withTransaction(async () => {
      // ⬇️ FIXED — scope "current" lookup by party too
      const currentFilter = {
        election: body.election,
        pollingUnit: body.pollingUnit,
        isCurrent: true,
      };
      if (submitterParty) currentFilter.party = submitterParty;

      const current = await models.Result.findOne(currentFilter)
        .sort({ version: -1 })
        .session(session)
        .lean();
      // ⬆️

      wasRevision = !!current;
      version = current ? current.version + 1 : 1;
      previousHash = current?.hash || null;

      resultDoc = new models.Result({
        election: body.election,
        party: submitterParty,              // ⬅️ NEW — the submitting party
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

      resultDoc.hash = computeHash(resultDoc, previousHash);

      if (current) {
        await models.Result.updateOne(
          { _id: current._id, isCurrent: true },
          { $set: { isCurrent: false, supersededBy: resultDoc._id, status: 'SUPERSEDED' } },
          { session }
        );
      }

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
      party: submitterParty,
      pollingUnit: body.pollingUnit,
      version,
      totalVotesCast: body.totalVotesCast,
      hash: resultDoc.hash,
      previousHash,
    },
    req,
  });

  // ⬇️ FIXED — Ward Admin lookup now also scoped by party
  const wardAdminQuery = {
    role: ROLES.WARD_ADMIN,
    'scope.ward': geo.ward,
    isActive: true,
  };
  if (submitterParty) wardAdminQuery['scope.party'] = submitterParty;

  const wardAdmin = await models.User.findOne(wardAdminQuery).select('_id').lean();
  // ⬆️

  if (wardAdmin) {
    await models.Notification.create({
      recipient: wardAdmin._id,
      type: 'RESULT_SUBMITTED',
      title: 'New result submitted',
      // ⬇️ FIXED — election has `name`, not `code`
      body: `PU ${geo.puCode} submitted a result for ${election.name}`,
      // ⬆️
      link: `/results/${resultDoc._id}`,
      refModel: 'Result',
      refId: resultDoc._id,
    });
  }

  invalidateCollation(resultDoc, user._id, 'submit');

  // ⬇️ Sanitize outgoing payload
  const payload = resultDoc.toJSON();
  sanitizePartyVotes(payload, user);
  res.status(201).json({ result: payload });
  // ⬆️
}

// =================================================================
// LIST (scoped)
// =================================================================
async function list(req, res) {
  const q = req.query;
  const filter = { ...scopeFilter(req) };

  // ⬇️ NEW — party isolation for non-cross-party roles
  if (!CROSS_PARTY_ROLES.has(req.user.role)) {
    const userParty = req.user.scope?.party;
    if (!userParty) throw ApiError.forbidden('Your account has no party scope assigned');
    filter.party = userParty;
  }
  // ⬆️

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

  const page = parseInt(q.page, 10) || 1;
  const limit = parseInt(q.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    models.Result.find(filter)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('election', 'name type scope year')   // ⬅️ FIXED — new Election fields
      .populate('pollingUnit', 'code name')
      .populate('party', 'name code abbreviation color')   // ⬅️ NEW
      .lean(),
    models.Result.countDocuments(filter),
  ]);

  // ⬇️ NEW — sanitize partyVotes for party-scoped roles
  for (const item of items) sanitizePartyVotes(item, req.user);
  // ⬆️

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
    .populate('election', 'name type scope year status')
    .populate('pollingUnit', 'code name address')
    .populate('party', 'name code abbreviation color')   // ⬅️ NEW
    .populate('submittedBy', 'firstName lastName role')
    .populate('verifiedBy', 'firstName lastName role');

  if (!result) throw ApiError.notFound('Result not found');
  assertCanAccess(req, result);

  // ⬇️ NEW — party isolation + partyVotes sanitization
  if (!CROSS_PARTY_ROLES.has(req.user.role)) {
    const userParty = req.user.scope?.party;
    if (!userParty || !result.party || result.party.toString() !== userParty.toString()) {
      throw ApiError.forbidden('You do not have access to this result');
    }
  }

  const payload = result.toJSON();
  sanitizePartyVotes(payload, req.user);
  res.json({ result: payload });
  // ⬆️
}

// =================================================================
// VERIFY (ward admin and above — only their scope, only SUBMITTED)
// =================================================================
async function verify(req, res) {
  const result = await models.Result.findById(req.params.id);
  if (!result) throw ApiError.notFound('Result not found');
  assertCanAccess(req, result);

  // ⬇️ NEW — party isolation
  if (!CROSS_PARTY_ROLES.has(req.user.role)) {
    const userParty = req.user.scope?.party;
    if (!userParty || !result.party || result.party.toString() !== userParty.toString()) {
      throw ApiError.forbidden('You cannot verify results for another party');
    }
  }
  // ⬆️

  if (result.status !== 'SUBMITTED') {
    throw ApiError.badRequest(`Cannot verify a result in status ${result.status}`);
  }
  if (!result.isCurrent) throw ApiError.badRequest('Cannot verify a superseded result');

  const partySum = result.partyVotes.reduce((sum, p) => sum + p.votes, 0);
  result.totalValidVotes = partySum;
  result.totalVotesCast = partySum + (result.rejectedBallots || 0);
  if (result.totalVotesCast > result.accreditedVoters) {
    result.accreditedVoters = result.totalVotesCast;
  }

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
    metadata: { election: result.election, party: result.party, puCode: result.puCode },
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

  invalidateCollation(result, req.user._id, 'verify');

  const payload = result.toJSON();
  sanitizePartyVotes(payload, req.user);
  res.json({ result: payload });
}

// =================================================================
// FLAG (ward admin and above — SUBMITTED or VERIFIED)
// =================================================================
async function flag(req, res) {
  const result = await models.Result.findById(req.params.id);
  if (!result) throw ApiError.notFound('Result not found');
  assertCanAccess(req, result);

  // ⬇️ NEW — party isolation
  if (!CROSS_PARTY_ROLES.has(req.user.role)) {
    const userParty = req.user.scope?.party;
    if (!userParty || !result.party || result.party.toString() !== userParty.toString()) {
      throw ApiError.forbidden('You cannot flag results for another party');
    }
  }
  // ⬆️

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

  invalidateCollation(result, req.user._id, 'flag');

  const payload = result.toJSON();
  sanitizePartyVotes(payload, req.user);
  res.json({ result: payload });
}

// =================================================================
// REJECT (ward admin and above — terminal)
// =================================================================
async function reject(req, res) {
  const result = await models.Result.findById(req.params.id);
  if (!result) throw ApiError.notFound('Result not found');
  assertCanAccess(req, result);

  // ⬇️ NEW — party isolation
  if (!CROSS_PARTY_ROLES.has(req.user.role)) {
    const userParty = req.user.scope?.party;
    if (!userParty || !result.party || result.party.toString() !== userParty.toString()) {
      throw ApiError.forbidden('You cannot reject results for another party');
    }
  }
  // ⬆️

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

  invalidateCollation(result, req.user._id, 'reject');

  const payload = result.toJSON();
  sanitizePartyVotes(payload, req.user);
  res.json({ result: payload });
}

module.exports = { submit, list, getOne, verify, flag, reject };
