
/*
|--------------------------------------------------------------------------
| ERMS USER ROLES
|--------------------------------------------------------------------------
*/

export const ROLES = {
  NATIONAL_SUPER_ADMIN: 'NATIONAL_SUPER_ADMIN',
  STATE_ADMIN: 'STATE_ADMIN',
  PARTY_ADMIN: 'PARTY_ADMIN',
  LGA_ADMIN: 'LGA_ADMIN',
  WARD_ADMIN: 'WARD_ADMIN',
  POLLING_UNIT_AGENT: 'POLLING_UNIT_AGENT',
  OBSERVER: 'OBSERVER',
};

/*
|--------------------------------------------------------------------------
| ROLE DISPLAY LABELS
|--------------------------------------------------------------------------
*/

export const ROLE_LABELS = {
  NATIONAL_SUPER_ADMIN: 'National Super Admin',
  STATE_ADMIN: 'State Admin',
  PARTY_ADMIN: 'Party Admin',
  LGA_ADMIN: 'LGA Admin',
  WARD_ADMIN: 'Ward Admin',
  POLLING_UNIT_AGENT: 'Polling Unit Agent',
  OBSERVER: 'Observer',
};

/*
|--------------------------------------------------------------------------
| HOME ROUTE AFTER LOGIN
|--------------------------------------------------------------------------
*/

export const HOME_BY_ROLE = {
  NATIONAL_SUPER_ADMIN: '/admin/dashboard',
  STATE_ADMIN: '/admin/dashboard',
  PARTY_ADMIN: '/admin/dashboard/party',
  LGA_ADMIN: '/admin/dashboard',
  WARD_ADMIN: '/admin/dashboard',
  POLLING_UNIT_AGENT: '/agent',
  OBSERVER: '/admin/dashboard',
};

/*
|--------------------------------------------------------------------------
| ADMIN ROLE CHECK
|--------------------------------------------------------------------------
*/

export function isAdmin(role) {
  return [
    ROLES.NATIONAL_SUPER_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.PARTY_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.WARD_ADMIN,
  ].includes(role);
}

/*
|--------------------------------------------------------------------------
| PARTY ROLE CHECK
|--------------------------------------------------------------------------
*/

export function isPartyAdmin(role) {
  return role === ROLES.PARTY_ADMIN;
}

/*
|--------------------------------------------------------------------------
| ELECTION MANAGEMENT ROLE CHECK
|--------------------------------------------------------------------------
*/

export function canManageElections(role) {
  return [
    ROLES.NATIONAL_SUPER_ADMIN,
    ROLES.STATE_ADMIN,
  ].includes(role);
}
