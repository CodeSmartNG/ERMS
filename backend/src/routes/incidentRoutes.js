const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { attachScope } = require('../middleware/scope');
const { uploadIncident } = require('../middleware/upload');
const { ROLES } = require('../utils/roleScope');
const ctrl = require('../controllers/incidentController');
const {
  submitIncidentSchema,
  listIncidentsSchema,
  updateStatusSchema,
  assignSchema,
} = require('../validators/incidentValidators');

const router = express.Router();

router.use(requireAuth, attachScope);

// Everyone can report; scope enforcement happens inside the controller.
router.post(
  '/',
  uploadIncident,
  validate(submitIncidentSchema),
  asyncHandler(ctrl.submit)
);

router.get('/',    validate(listIncidentsSchema, 'query'), asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));

router.patch(
  '/:id/assign',
  requireRole(ROLES.WARD_ADMIN, ROLES.LGA_ADMIN, ROLES.STATE_ADMIN, ROLES.NATIONAL_SUPER_ADMIN),
  validate(assignSchema),
  asyncHandler(ctrl.assign)
);

router.patch(
  '/:id/status',
  validate(updateStatusSchema),
  asyncHandler(ctrl.updateStatus)
);

module.exports = router;
