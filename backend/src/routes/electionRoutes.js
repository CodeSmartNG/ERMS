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

// List elections
router.get('/', asyncHandler(ctrl.list));

// Get parties for a specific election
router.get('/:id/parties', asyncHandler(ctrl.parties));

// Create election (Super Admin & State Admins)
router.post(
  '/',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN),
  validate(z.object({
    code: z.string().min(2).max(20),
    title: z.string().min(5).max(200),
    level: z.enum(ELECTION_LEVELS), // <-- Added Level
    type: z.enum(ELECTION_TYPES),
    electionDate: z.string().datetime(),
    status: z.enum(ELECTION_STATUSES).optional(),
    state: z.string().optional(), // <-- Added State
    lga: z.string().optional(),   // <-- Added LGA
    ward: z.string().optional(),  // <-- Added Ward
  })),
  asyncHandler(ctrl.create)
);

// Update status (Super Admin & State Admins)
router.patch(
  '/:id/status',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN),
  validate(z.object({ status: z.enum(ELECTION_STATUSES) })),
  asyncHandler(ctrl.updateStatus)
);

module.exports = router;