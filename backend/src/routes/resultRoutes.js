const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { attachScope } = require('../middleware/scope');
const { uploadEvidence } = require('../middleware/upload');
const { ROLES } = require('../utils/roleScope');
const ctrl = require('../controllers/resultController');
const {
  submitResultSchema,
  listResultsSchema,
  verifyResultSchema,
  flagResultSchema,
  rejectResultSchema,
} = require('../validators/resultValidators');

const router = express.Router();

router.use(requireAuth, attachScope);

// --- submit (multipart) ---
router.post(
  '/',
  requireRole(ROLES.POLLING_UNIT_AGENT, ROLES.NATIONAL_SUPER_ADMIN),
  uploadEvidence,
  validate(submitResultSchema, 'body'),
  asyncHandler(ctrl.submit)
);

// --- list / read ---
router.get('/',    validate(listResultsSchema, 'query'), asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));

// --- workflow (ward admin and above) ---
router.patch(
  '/:id/verify',
  requireRole(ROLES.WARD_ADMIN, ROLES.LGA_ADMIN, ROLES.STATE_ADMIN, ROLES.NATIONAL_SUPER_ADMIN),
  validate(verifyResultSchema),
  asyncHandler(ctrl.verify)
);

router.patch(
  '/:id/flag',
  requireRole(ROLES.WARD_ADMIN, ROLES.LGA_ADMIN, ROLES.STATE_ADMIN, ROLES.NATIONAL_SUPER_ADMIN),
  validate(flagResultSchema),
  asyncHandler(ctrl.flag)
);

router.patch(
  '/:id/reject',
  requireRole(ROLES.WARD_ADMIN, ROLES.LGA_ADMIN, ROLES.STATE_ADMIN, ROLES.NATIONAL_SUPER_ADMIN),
  validate(rejectResultSchema),
  asyncHandler(ctrl.reject)
);

module.exports = router;
