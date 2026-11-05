const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/roleScope');

const SCOPED_ROLES = new Set([
  ROLES.STATE_ADMIN,
  ROLES.LGA_ADMIN,
  ROLES.WARD_ADMIN,
  ROLES.POLLING_UNIT_AGENT,
]);

/**
 * Builds req.scope:
 *   { level: 'NATIONAL' | 'STATE' | 'LGA' | 'WARD' | 'PU',
 *     state, lga, ward, pollingUnit }  // ObjectIds or null
 */
function attachScope(req, _res, next) {
  const u = req.user;
  if (u.role === ROLES.NATIONAL_SUPER_ADMIN) {
    req.scope = { level: 'NATIONAL', state: null, lga: null, ward: null, pollingUnit: null };
  } else if (u.role === ROLES.OBSERVER) {
    // Observers are read-only but otherwise unrestricted by default.
    req.scope = { level: 'NATIONAL', state: null, lga: null, ward: null, pollingUnit: null };
  } else if (u.role === ROLES.STATE_ADMIN) {
    req.scope = { level: 'STATE', state: u.scope.state, lga: null, ward: null, pollingUnit: null };
  } else if (u.role === ROLES.LGA_ADMIN) {
    req.scope = { level: 'LGA', state: u.scope.state, lga: u.scope.lga, ward: null, pollingUnit: null };
  } else if (u.role === ROLES.WARD_ADMIN) {
    req.scope = { level: 'WARD', state: u.scope.state, lga: u.scope.lga, ward: u.scope.ward, pollingUnit: null };
  } else if (u.role === ROLES.POLLING_UNIT_AGENT) {
    req.scope = {
      level: 'PU',
      state: u.scope.state,
      lga: u.scope.lga,
      ward: u.scope.ward,
      pollingUnit: u.scope.pollingUnit,
    };
  } else {
    return next(ApiError.forbidden(`Unknown role: ${u.role}`));
  }
  next();
}

/**
 * Returns a Mongo filter derived from the caller's scope.
 * Controllers use:
 *   Result.find({ election, ...scopeFilter(req) })
 *   Result.find({ election, ...scopeFilter(req, { state: 'stateId' }) }) // custom field
 */
function scopeFilter(req, fieldMap = {}) {
  const f = { state: 'state', lga: 'lga', ward: 'ward', pollingUnit: 'pollingUnit', ...fieldMap };
  const s = req.scope;
  if (!s) throw ApiError.internal('scopeFilter called without req.scope');
  if (s.level === 'NATIONAL') return {};
  const filter = {};
  if (s.state)       filter[f.state]       = s.state;
  if (s.lga)         filter[f.lga]         = s.lga;
  if (s.ward)        filter[f.ward]        = s.ward;
  if (s.pollingUnit) filter[f.pollingUnit] = s.pollingUnit;
  return filter;
}

/**
 * Throws 403 if `resource` (an object with state/lga/ward/pollingUnit fields)
 * falls outside the caller's scope. Fails CLOSED — missing field ⇒ deny.
 */
function assertCanAccess(req, resource) {
  const s = req.scope;
  if (!s) throw ApiError.internal('assertCanAccess called without req.scope');
  if (s.level === 'NATIONAL') return;

  for (const field of ['state', 'lga', 'ward', 'pollingUnit']) {
    if (!s[field]) continue;
    const rv = resource?.[field];
    if (!rv) throw ApiError.forbidden(`Access denied: resource missing ${field}`);
    if (!s[field].equals(rv)) throw ApiError.forbidden(`Access denied: ${field} out of scope`);
  }
}

module.exports = { attachScope, scopeFilter, assertCanAccess, SCOPED_ROLES };
