const models = require('../models');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');
const { ELECTION_STATUSES } = require('../models/Election');

// =================================================================
// LIST ELECTIONS (scoped)
// =================================================================
async function list(req, res) {
  const { status, type, page = 1, limit = 50 } = req.query;

  if (status && !ELECTION_STATUSES.includes(status)) {
    throw ApiError.badRequest(
      `status must be one of: ${ELECTION_STATUSES.join(', ')}`
    );
  }

  const filter = {};

  if (status) filter.status = status;
  if (type) filter.type = type;

  const user = req.user;
  const userStateId = user.scope?.state || null;

  if (user.role === 'POLLING_UNIT_AGENT') {
    if (!filter.status) filter.status = 'ACTIVE';
    if (userStateId) {
      filter.$or = [
        { states: { $size: 0 } },
        { states: { $in: [userStateId] } },
      ];
    }
  } else if (userStateId) {
    filter.$or = [
      { states: { $size: 0 } },
      { states: { $in: [userStateId] } },
    ];
  }

  const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(200, Math.max(1, parseInt(limit, 10)));
  const take = Math.min(200, Math.max(1, parseInt(limit, 10)));

  const [elections, total] = await Promise.all([
    models.Election.find(filter)
      .sort({ electionDate: -1 })
      .skip(skip)
      .limit(take)
      .select('code title type electionDate status states publishedAt createdAt')
      .lean(),
    models.Election.countDocuments(filter),
  ]);

  res.json({
    elections,
    pagination: {
      page: Math.floor(skip / take) + 1,
      limit: take,
      total,
      pages: Math.ceil(total / take),
    },
  });
}

// =================================================================
// GET PARTIES FOR AN ELECTION
// =================================================================
async function parties(req, res) {
  const election = await models.Election.findById(req.params.id)
    .select('_id states')
    .lean();
  if (!election) throw ApiError.notFound('Election not found');

  const user = req.user;
  if (user.scope?.state && election.states.length > 0) {
    const allowed = election.states.some((s) => s.equals(user.scope.state));
    if (!allowed) {
      throw ApiError.forbidden('Election is not active in your state');
    }
  }

  const partyIds = await models.Candidate
    .find({ election: election._id, isActive: true })
    .distinct('party');

  const parties = await models.Party
    .find({ _id: { $in: partyIds }, isActive: true })
    .sort({ code: 1 })
    .select('code name abbreviation color logoUrl')
    .lean();

  res.json({ parties });
}

// =================================================================
// CREATE ELECTION (Super Admin only)
// =================================================================
async function create(req, res) {
  const { code, title, type, electionDate, status, states } = req.body;

  const existing = await models.Election.findOne({ code: code.toUpperCase() });
  if (existing) throw ApiError.conflict('Election code already exists');

  const election = await models.Election.create({
    code: code.toUpperCase(),
    title,
    type,
    electionDate: new Date(electionDate),
    status: status || 'DRAFT',
    states: states || [],
    createdBy: req.user._id,
  });

  await audit.log({
    actor: req.user._id, actorRole: req.user.role,
    action: 'ELECTION_CREATED',
    entity: 'Election', entityId: election._id,
    metadata: { code, title }, req,
  });

  res.status(201).json({ election });
}

// =================================================================
// UPDATE STATUS (Super Admin only)
// =================================================================
async function updateStatus(req, res) {
  const { status } = req.body;
  if (!ELECTION_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status');

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
}

module.exports = { list, parties, create, updateStatus };
