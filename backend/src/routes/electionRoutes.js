const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { attachScope } = require('../middleware/scope');
const { ELECTION_STATUSES, ELECTION_TYPES } = require('../models/Election');
const ctrl = require('../controllers/electionController');

const router = express.Router();

router.use(requireAuth, attachScope);

const listQuerySchema = z.object({
  status: z.enum(ELECTION_STATUSES).optional(),
  type:   z.enum(ELECTION_TYPES).optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(ctrl.list)
);

router.get(
  '/:id/parties',
  asyncHandler(ctrl.parties)
);

module.exports = router;
