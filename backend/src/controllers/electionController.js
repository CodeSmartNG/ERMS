// backend/src/controllers/electionController.js (new)
const models = require('../models');
async function list(req, res) {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const elections = await models.Election.find(filter).sort({ electionDate: -1 }).lean();
  res.json({ elections });
}
module.exports = { list };
