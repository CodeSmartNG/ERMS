
const ROLES = Object.freeze({
  NATIONAL_SUPER_ADMIN: 'NATIONAL_SUPER_ADMIN',
  STATE_ADMIN: 'STATE_ADMIN',
  PARTY_ADMIN: 'PARTY_ADMIN',
  LGA_ADMIN: 'LGA_ADMIN',
  WARD_ADMIN: 'WARD_ADMIN',
  POLLING_UNIT_AGENT: 'POLLING_UNIT_AGENT',
  OBSERVER: 'OBSERVER',
});

// Only PARTY_ADMIN requires political-party affiliation.
const ROLE_SCOPE = Object.freeze({
  [ROLES.NATIONAL_SUPER_ADMIN]: [],

  [ROLES.STATE_ADMIN]: [
    'state',
  ],

  [ROLES.PARTY_ADMIN]: [
    'party',
    'state',
  ],

  [ROLES.LGA_ADMIN]: [
    'state',
    'lga',
  ],

  [ROLES.WARD_ADMIN]: [
    'state',
    'lga',
    'ward',
  ],

  [ROLES.POLLING_UNIT_AGENT]: [
    'state',
    'lga',
    'ward',
    'pollingUnit',
  ],

  [ROLES.OBSERVER]: [],
});

// Roles each administrator is allowed to create.
const CREATABLE_ROLES = Object.freeze({
  [ROLES.NATIONAL_SUPER_ADMIN]: Object.values(ROLES),

  [ROLES.STATE_ADMIN]: [
    ROLES.PARTY_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.WARD_ADMIN,
    ROLES.POLLING_UNIT_AGENT,
    ROLES.OBSERVER,
  ],

  [ROLES.PARTY_ADMIN]: [
    ROLES.LGA_ADMIN,
    ROLES.WARD_ADMIN,
    ROLES.POLLING_UNIT_AGENT,
    ROLES.OBSERVER,
  ],

  [ROLES.LGA_ADMIN]: [
    ROLES.WARD_ADMIN,
    ROLES.POLLING_UNIT_AGENT,
    ROLES.OBSERVER,
  ],

  [ROLES.WARD_ADMIN]: [
    ROLES.POLLING_UNIT_AGENT,
    ROLES.OBSERVER,
  ],

  [ROLES.POLLING_UNIT_AGENT]: [],

  [ROLES.OBSERVER]: [],
});

function canCreateRole(creatorRole, targetRole) {
  return (CREATABLE_ROLES[creatorRole] || []).includes(targetRole);
}

function requiredScopeFields(role) {
  return ROLE_SCOPE[role] || [];
}

module.exports = {
  ROLES,
  ROLE_SCOPE,
  CREATABLE_ROLES,
  canCreateRole,
  requiredScopeFields,
};
