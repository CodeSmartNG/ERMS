const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roleScope');
const { ELECTION_TYPES, ELECTION_STATUSES } = require('../models/Election');
const ctrl = require('../controllers/electionController');

const router = express.Router();
router.use(requireAuth);

// Anyone authenticated can list
router.get('/', asyncHandler(ctrl.list));

// Only Super Admin can create/update
const createSchema = z.object({
  code: z.string().min(2).max(20),
  title: z.string().min(5).max(200),
  type: z.enum(ELECTION_TYPES),
  electionDate: z.string().datetime(),
  status: z.enum(ELECTION_STATUSES).optional(),
});

router.post(
  '/',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN),
  validate(createSchema),
  asyncHandler(ctrl.create)
);

router.patch(
  '/:id/status',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN),
  validate(z.object({ status: z.enum(ELECTION_STATUSES) })),
  asyncHandler(ctrl.updateStatus)
);

module.exports = router;
