const models = require('../models');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');
const { ELECTION_STATUSES } = require('../models/Election');

// =================================================================
// LIST ELECTIONS
// =================================================================
async function list(req, res) {
  const { status, type, level, page = 1, limit = 50 } = req.query;

  if (status && !ELECTION_STATUSES.includes(status)) {
    throw ApiError.badRequest(`status must be one of: ${ELECTION_STATUSES.join(', ')}`);
  }

  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (level) filter.level = level;

  const user = req.user;
  const userStateId = user.scope?.state || null;

  if (user.role === 'POLLING_UNIT_AGENT') {
    if (!filter.status) filter.status = 'ACTIVE';
  } else if (userStateId) {
    // State Admins see their state's elections + National elections
    filter.$or = [
      { level: 'FEDERAL', type: 'PRESIDENT' },
      { state: userStateId },
    ];
  }

  const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(200, Math.max(1, parseInt(limit, 10)));
  const take = Math.min(200, Math.max(1, parseInt(limit, 10)));

  const [elections, total] = await Promise.all([
    models.Election.find(filter).sort({ electionDate: -1 }).skip(skip).limit(take).lean(),
    models.Election.countDocuments(filter),
  ]);

  res.json({ elections, pagination: { page: Math.floor(skip / take) + 1, limit: take, total, pages: Math.ceil(total / take) } });
}

// =================================================================
// GET PARTIES FOR AN ELECTION
// =================================================================
async function parties(req, res) {
  const election = await models.Election.findById(req.params.id).select('_id state level type').lean();
  if (!election) throw ApiError.notFound('Election not found');

  const user = req.user;
  // If a State Admin is trying to access an election in another state, block them
  if (user.scope?.state && election.state && !election.state.equals(user.scope.state)) {
    throw ApiError.forbidden('Election is not active in your state');
  }

  const partyIds = await models.Candidate.find({ election: election._id, isActive: true }).distinct('party');

  const parties = await models.Party.find({ _id: { $in: partyIds }, isActive: true })
    .sort({ code: 1 })
    .select('code name abbreviation color logoUrl')
    .lean();

  res.json({ parties });
}

// =================================================================
// CREATE ELECTION
// =================================================================
async function create(req, res) {
  const { code, title, level, type, electionDate, status, state, lga, ward } = req.body;

  const existing = await models.Election.findOne({ code: code.toUpperCase() });
  if (existing) throw ApiError.conflict('Election code already exists');

  // 1. Auto-assign State for State Admins
  let finalState = state;
  if (req.user.role === 'STATE_ADMIN' && req.user.scope?.state) {
    finalState = req.user.scope.state;
  }

  const election = await models.Election.create({
    code: code.toUpperCase(),
    title,
    level,
    type,
    state: finalState,
    lga,
    ward,
    electionDate: new Date(electionDate),
    status: status || 'DRAFT',
    createdBy: req.user._id,
  });

  await audit.log({
    actor: req.user._id, actorRole: req.user.role,
    action: 'ELECTION_CREATED',
    entity: 'Election', entityId: election._id,
    metadata: { code, title, level, type }, req,
  });

  res.status(201).json({ election });
}

// =================================================================
// UPDATE STATUS
// =================================================================
async function updateStatus(req, res) {
  const { status } = req.body;
  if (!ELECTION_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status');

  try {
    const election = await models.Election.findById(req.params.id);
    if (!election) throw ApiError.notFound('Election not found');

    election.status = status;
    await election.save();

    await audit.log({
      actor: req.user._id, actorRole: req.user.role,
      action: 'ELECTION_STATUS_CHANGED',
      entity: 'Election', entityId: election._id,
      metadata: { status }, req,
    });

    res.json({ election });
  } catch (err) {
    // This will send the exact error to the app
    res.status(400).json({ error: err.message });
  }
}

module.exports = { list, parties, create, updateStatus };