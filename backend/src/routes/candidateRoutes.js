const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roleScope');
const ctrl = require('../controllers/candidateController');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));

router.post(
  '/', 
  requireRole(ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN), // <--- Added STATE_ADMIN
  asyncHandler(ctrl.create)
);

module.exports = router;