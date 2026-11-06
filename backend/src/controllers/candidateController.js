const models = require('../models');
const ApiError = require('../utils/ApiError');

async function list(req, res) {
  const candidates = await models.Candidate.find({ election: req.query.election, isActive: true })
    .populate('party', 'code name')
    .lean();
  res.json({ candidates });
}

async function create(req, res) {
  const { election, party, firstName, lastName } = req.body;
  
  const existing = await models.Candidate.findOne({ election, party, isActive: true });
  if (existing) throw ApiError.conflict('This party already has a candidate for this election');

  const candidate = await models.Candidate.create({ election, party, firstName, lastName });
  res.status(201).json({ candidate });
}

module.exports = { list, create };
