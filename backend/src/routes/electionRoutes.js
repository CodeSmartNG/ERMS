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

// 1. List elections
router.get('/', asyncHandler(ctrl.list));

// 2. THIS IS THE MISSING LINE: Get parties for an election
router.get('/:id/parties', asyncHandler(ctrl.parties));

// 3. Create election
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

// 4. Update status
router.patch(
  '/:id/status',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN),
  validate(z.object({ status: z.enum(ELECTION_STATUSES) })),
  asyncHandler(ctrl.updateStatus)
);

module.exports = router;
