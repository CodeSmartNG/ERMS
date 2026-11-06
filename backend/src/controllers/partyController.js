const models = require('../models');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');

async function list(_req, res) {
  const parties = await models.Party.find({ isActive: true }).sort({ code: 1 }).lean();
  res.json({ parties });
}

async function create(req, res) {
  const { code, name, abbreviation } = req.body;

  const existing = await models.Party.findOne({ code: code.toUpperCase() });
  if (existing) throw ApiError.conflict('Party code already exists');

  const party = await models.Party.create({
    code: code.toUpperCase(),
    name,
    abbreviation,
    isActive: true,
  });

  await audit.log({
    actor: req.user._id, actorRole: req.user.role,
    action: 'PARTY_CREATED',
    entity: 'Party', entityId: party._id,
    metadata: { code, name }, req,
  });

  res.status(201).json({ party });
}

module.exports = { list, create };
