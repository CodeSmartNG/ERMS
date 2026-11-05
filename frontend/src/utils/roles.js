export const ROLES = {
  NATIONAL_SUPER_ADMIN: 'NATIONAL_SUPER_ADMIN',
  STATE_ADMIN: 'STATE_ADMIN',
  LGA_ADMIN: 'LGA_ADMIN',
  WARD_ADMIN: 'WARD_ADMIN',
  POLLING_UNIT_AGENT: 'POLLING_UNIT_AGENT',
  OBSERVER: 'OBSERVER',
};

export const ROLE_LABELS = {
  NATIONAL_SUPER_ADMIN: 'National Super Admin',
  STATE_ADMIN: 'State Admin',
  LGA_ADMIN: 'LGA Admin',
  WARD_ADMIN: 'Ward Admin',
  POLLING_UNIT_AGENT: 'Polling Unit Agent',
  OBSERVER: 'Observer',
};

// Landing route per role after login
export const HOME_BY_ROLE = {
  NATIONAL_SUPER_ADMIN: '/admin/dashboard',
  STATE_ADMIN: '/admin/dashboard',
  LGA_ADMIN: '/admin/dashboard',
  WARD_ADMIN: '/admin/dashboard',
  POLLING_UNIT_AGENT: '/agent',
  OBSERVER: '/admin/dashboard',
};

export function isAdmin(role) {
  return [
    ROLES.NATIONAL_SUPER_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.WARD_ADMIN,
  ].includes(role);
}
