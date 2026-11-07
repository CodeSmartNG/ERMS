const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { attachScope } = require('../middleware/scope');
const { ROLES } = require('../utils/roleScope');
const ctrl = require('../controllers/reportController');

const router = express.Router();

router.use(requireAuth, attachScope);

// Only admins and observers can download reports
router.get(
  '/:electionId/results.csv',
  requireRole(
    ROLES.NATIONAL_SUPER_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.WARD_ADMIN,
    ROLES.OBSERVER
  ),
  asyncHandler(ctrl.exportResultsCSV)
);

router.get(
  '/:electionId/collation.csv',
  requireRole(
    ROLES.NATIONAL_SUPER_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.OBSERVER
  ),
  asyncHandler(ctrl.exportCollationCSV)
);

module.exports = router;
