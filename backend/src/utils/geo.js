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
    lgaCode:     pu.lgaCode,
    wardCode:    pu.wardCode,
    puCode:      pu.code,
    path:        pu.path,
    registeredVoters: pu.registeredVoters,
  };
}

/**
 * Builds the path array for any geo level, used by Incident and Collation.
 *   buildPath({ stateCode: 'KN' })                 => ['KN']
 *   buildPath({ stateCode:'KN', lgaCode:'KN-01' }) => ['KN','KN-01']
 */
function buildPath({ stateCode, lgaCode, wardCode, puCode }) {
  const p = [];
  if (stateCode) p.push(stateCode);
  if (lgaCode)   p.push(lgaCode);
  if (wardCode)  p.push(wardCode);
  if (puCode)    p.push(puCode);
  return p;
}

module.exports = { resolvePollingUnit, buildPath };
