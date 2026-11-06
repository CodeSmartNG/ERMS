const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES } = require('../utils/roleScope');
const ctrl = require('../controllers/partyController');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));

router.post(
  '/',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN),
  validate(z.object({
    code: z.string().min(2).max(15),
    name: z.string().min(3).max(100),
    abbreviation: z.string().min(2).max(10),
  })),
  asyncHandler(ctrl.create)
);

module.exports = router;
