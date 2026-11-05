const models = require('../models');
const ApiError = require('../utils/ApiError');
const { ELECTION_STATUSES } = require('../models/Election');

// =================================================================
// LIST ELECTIONS (scoped)
// =================================================================
async function list(req, res) {
  const { status, type, page = 1, limit = 50 } = req.query;

  // ---- validate query params ----
  if (status && !ELECTION_STATUSES.includes(status)) {
    throw ApiError.badRequest(
      `status must be one of: ${ELECTION_STATUSES.join(', ')}`
    );
  }

  const filter = {};

  if (status) filter.status = status;
  if (type) filter.type = type;

  // ---- scope: non-super-admins only see elections active in their state ----
  // PU agents additionally only see ACTIVE elections (they can't submit to
  // UPCOMING / COLLATING / PUBLISHED).
  const user = req.user;
  const userStateId = user.scope?.state || null;

  if (user.role === 'POLLING_UNIT_AGENT') {
    if (!filter.status) filter.status = 'ACTIVE';
    if (userStateId) {
      filter.$or = [
        { states: { $size: 0 } },              // national elections (presidential)
        { states: { $in: [userStateId] } },    // state-scoped elections
      ];
    }
  } else if (userStateId) {
    // State/LGA/Ward admins — see elections relevant to their state
    filter.$or = [
      { states: { $size: 0 } },
      { states: { $in: [userStateId] } },
    ];
  }
  // NATIONAL_SUPER_ADMIN / OBSERVER: no state filter — see everything

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
// Returns only parties that have an active candidate in this election,
// so the frontend can render the party-vote grid without loading the
// full party collection.
// =================================================================
async function parties(req, res) {
  const election = await models.Election.findById(req.params.id)
    .select('_id states')
    .lean();
  if (!election) throw ApiError.notFound('Election not found');

  // Scope check: non-super-admins can only load parties for elections in
  // their state (or national elections). This is the same rule applied in
  // the submit endpoint's eligibility check, so the frontend can't render
  // a party grid the backend will reject on submit.
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

module.exports = { list, parties };
