const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { attachScope } = require('../middleware/scope');
const { ROLES } = require('../utils/roleScope');
const { loginLimiter, refreshLimiter, registerLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/authController');
const {
  loginSchema,
  refreshSchema,
  logoutSchema,
  registerSchema,
} = require('../validators/authValidators');

const router = express.Router();

router.post('/login',   loginLimiter,   validate(loginSchema),   asyncHandler(ctrl.login));
router.post('/refresh', refreshLimiter, validate(refreshSchema), asyncHandler(ctrl.refresh));

router.post('/logout', requireAuth, validate(logoutSchema), asyncHandler(ctrl.logout));
router.get('/me',      requireAuth,                           asyncHandler(ctrl.me));

router.post(
  '/register',
  requireAuth,
  requireRole(
    ROLES.NATIONAL_SUPER_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.WARD_ADMIN
  ),
  attachScope,
  registerLimiter,
  validate(registerSchema),
  asyncHandler(ctrl.register)
);

module.exports = router;
