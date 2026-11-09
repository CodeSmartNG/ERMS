const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roleScope');
const { ELECTION_TYPES, ELECTION_STATUSES, ELECTION_LEVELS } = require('../models/Election');
const ctrl = require('../controllers/electionController');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));
router.get('/:id/parties', asyncHandler(ctrl.parties));

router.post(
  '/',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN),
  validate(z.object({
    code: z.string().min(2).max(20),
    title: z.string().min(5).max(200),
    level: z.enum(ELECTION_LEVELS),
    type: z.enum(ELECTION_TYPES),
    electionDate: z.string().datetime(),
    status: z.enum(ELECTION_STATUSES).optional(),
    // FIX: Accept empty strings or undefined
    state: z.string().optional().nullable().transform(v => v || null),
    lga: z.string().optional().nullable().transform(v => v || null),
    ward: z.string().optional().nullable().transform(v => v || null),
  })),
  asyncHandler(ctrl.create)
);

router.patch(
  '/:id/status',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN),
  validate(z.object({ status: z.enum(ELECTION_STATUSES) })),
  asyncHandler(ctrl.updateStatus)
);

module.exports = router;
