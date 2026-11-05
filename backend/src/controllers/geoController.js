const models = require('../models');
const ApiError = require('../utils/ApiError');

// =================================================================
// GET /api/geo/states
// All 37 states + FCT. Not scoped — everyone can see the list.
// =================================================================
async function listStates(_req, res) {
  const states = await models.State.find({ isActive: true })
    .sort({ name: 1 })
    .select('code name slug zone')
    .lean();

  res.json({ states });
}

// =================================================================
// GET /api/geo/states/:code/lgas
// LGAs within a state, identified by state code.
// =================================================================
async function listLGAs(req, res) {
  const stateCode = req.params.code.toUpperCase();

  const state = await models.State.findOne({ code: stateCode })
    .select('_id code name')
    .lean();
  if (!state) throw ApiError.notFound('State not found');

  const lgas = await models.LGA.find({ state: state._id, isActive: true })
    .sort({ name: 1 })
    .select('code name')
    .lean();

  res.json({ state, lgas });
}

// =================================================================
// GET /api/geo/lgas/:code/wards
// Wards within an LGA, identified by LGA code.
// =================================================================
async function listWards(req, res) {
  const lgaCode = req.params.code.toUpperCase();

  const lga = await models.LGA.findOne({ code: lgaCode })
    .select('_id code name state stateCode')
    .lean();
  if (!lga) throw ApiError.notFound('LGA not found');

  const wards = await models.Ward.find({ lga: lga._id, isActive: true })
    .sort({ name: 1 })
    .select('code name')
    .lean();

  res.json({ lga, wards });
}

// =================================================================
// GET /api/geo/wards/:code/polling-units
// PUs within a ward, identified by ward code.
// =================================================================
async function listPollingUnits(req, res) {
  const wardCode = req.params.code.toUpperCase();

  const ward = await models.Ward.findOne({ code: wardCode })
    .select('_id code name lgaCode stateCode')
    .lean();
  if (!ward) throw ApiError.notFound('Ward not found');

  const pollingUnits = await models.PollingUnit.find({
    ward: ward._id,
    isActive: true,
  })
    .sort({ code: 1 })
    .select('code name registeredVoters')
    .lean();

  res.json({ ward, pollingUnits });
}

module.exports = { listStates, listLGAs, listWards, listPollingUnits };
