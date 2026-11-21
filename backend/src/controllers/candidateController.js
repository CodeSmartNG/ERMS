const models = require('../models');
const ApiError = require('../utils/ApiError');

// ============================================================
// LIST CANDIDATES
// ============================================================
async function list(req, res) {
  const filter = { isActive: true };
  
  // Only filter by election if one is provided in the query
  if (req.query.election) {
    filter.election = req.query.election;
  }

  const candidates = await models.Candidate.find(filter)
    .populate('party', 'code name abbreviation')
    .populate('election', 'title code')
    .lean();

  res.json({ candidates });
}

// ============================================================
// CREATE CANDIDATE
// ============================================================
async function create(req, res) {
  // 1. Extract the exact fields the frontend is sending
  const { election, party, name, position } = req.body;

  if (!election || !party || !name || !position) {
    throw ApiError.badRequest('Election, party, name, and position are required');
  }

  // 2. Prevent duplicate candidates for the same party in the same election
  const existing = await models.Candidate.findOne({ election, party, isActive: true });
  if (existing) {
    throw ApiError.conflict('This party already has a candidate for this election');
  }

  // 3. Create the candidate, ensuring `createdBy` is attached from the JWT
  const candidate = await models.Candidate.create({
    election,
    party,
    name,
    position,
    createdBy: req.user._id, // ⬅️ THIS WAS MISSING
  });

  res.status(201).json({ candidate });
}

module.exports = { list, create };
