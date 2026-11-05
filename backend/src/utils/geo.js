const PollingUnit = require('../models/PollingUnit');
const ApiError = require('./ApiError');

/**
 * Loads a PU and returns the denormalized fields needed on Result/Incident docs.
 * Single source of truth — never trust client-supplied geo fields.
 */
async function resolvePollingUnit(puId) {
  const pu = await PollingUnit.findById(puId).lean();
  if (!pu) throw ApiError.badRequest('PollingUnit not found');
  if (!pu.isActive) throw ApiError.badRequest('PollingUnit is inactive');

  return {
    pollingUnit: pu._id,
    state:       pu.ancestors.state,
    lga:         pu.ancestors.lga,
    ward:        pu.ancestors.ward,
    stateCode:   pu.stateCode,
    lgaCode:
