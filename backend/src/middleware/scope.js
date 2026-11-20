const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/roleScope');

const SCOPED_ROLES = new Set([
  ROLES.STATE_ADMIN,
  ROLES.PARTY_ADMIN,          // ⬅️ NEW
  ROLES.LGA_ADMIN,
  ROLES.WARD_ADMIN,
  ROLES.POLLING_UNIT_AGENT,
]);

/**
 * Builds req.scope:
 *   { level: 'NATIONAL' | 'STATE' | 'PARTY' | 'LGA' | 'WARD' | 'PU',
 *     party, state, lga, ward, pollingUnit }  // ObjectIds or null
 *
 * NEW: `party` is present at every level except NATIONAL (Super Admin / Observer).
 */
function attachScope(req, _res, next) {
  const u = req.user;
  if (u.role === ROLES.NATIONAL_SUPER_ADMIN || u.role === ROLES.OBSERVER) {
    req.scope = {
      level: 'NATIONAL',
      party: null,
      state: null,
      lga: null,
      ward: null,
      pollingUnit: null,
    };
  } else if (u.role === ROLES.STATE_ADMIN) {
    // State Admin sees ALL parties within their state
    req.scope = {
      level: 'STATE',
      party: null,                       // ⬅️ null — cross-party
      state: u.scope.state,
      lga: null,
      ward: null,
      pollingUnit: null,
    };
  } else if (u.role === ROLES.PARTY_ADMIN) {
    req.scope = {
      level: 'PARTY',
      party: u.scope.party,              // ⬅️ NEW
      state: u.scope.state,
      lga: null,
      ward: null,
      pollingUnit: null,
    };
  } else if (u.role === ROLES.LGA_ADMIN) {
    req.scope = {
      level: 'LGA',
      party: u.scope.party,              // ⬅️ NEW
      state: u.scope.state,
      lga: u.scope.lga,
      ward: null,
      pollingUnit: null,
    };
  } else if (u.role === ROLES.WARD_ADMIN) {
    req.scope = {
      level: 'WARD',
      party: u.scope.party,              // ⬅️ NEW
      state: u.scope.state,
      lga: u.scope.lga,
      ward: u.scope.ward,
      pollingUnit: null,
    };
  } else if (u.role === ROLES.POLLING_UNIT_AGENT) {
    req.scope = {
      level: 'PU',
      party: u.scope.party,              // ⬅️ NEW
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
 * Now includes `party` at every level below STATE.
 */
function scopeFilter(req, fieldMap = {}) {
  const f = {
    party: 'party',                      // ⬅️ NEW
    state: 'state',
    lga: 'lga',
    ward: 'ward',
    pollingUnit: 'pollingUnit',
    ...fieldMap,
  };
  const s = req.scope;
  if (!s) throw ApiError.internal('scopeFilter called without req.scope');
  if (s.level === 'NATIONAL') return {};
  const filter = {};
  if (s.party)       filter[f.party]       = s.party;       // ⬅️ NEW
  if (s.state)       filter[f.state]       = s.state;
  if (s.lga)         filter[f.lga]         = s.lga;
  if (s.ward)        filter[f.ward]        = s.ward;
  if (s.pollingUnit) filter[f.pollingUnit] = s.pollingUnit;
  return filter;
}

/**
 * Throws 403 if `resource` falls outside the caller's scope.
 * Fails CLOSED — missing field ⇒ deny.
 * Now checks party BEFORE geography.
 */
function assertCanAccess(req, resource) {
  const s = req.scope;
  if (!s) throw ApiError.internal('assertCanAccess called without req.scope');
  if (s.level === 'NATIONAL') return;

  // ⬇️ NEW — party check first (highest priority)
  if (s.party) {
    const rv = resource?.party;
    if (!rv) throw ApiError.forbidden('Access denied: resource has no party field');
    if (!s.party.equals(rv)) {
      throw ApiError.forbidden('Access denied: resource belongs to another party');
    }
  }
  // ⬆️

  // Geographic checks (existing)
  for (const field of ['state', 'lga', 'ward', 'pollingUnit']) {
    if (!s[field]) continue;
    const rv = resource?.[field];
    if (!rv) throw ApiError.forbidden(`Access denied: resource missing ${field}`);
    if (!s[field].equals(rv)) throw ApiError.forbidden(`Access denied: ${field} out of scope`);
  }
}

module.exports = { attachScope, scopeFilter, assertCanAccess, SCOPED_ROLES };
