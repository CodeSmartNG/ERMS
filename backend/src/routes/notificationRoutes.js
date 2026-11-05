const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { NOTIFICATION_TYPES } = require('../models/Notification');
const ctrl = require('../controllers/notificationController');

const router = express.Router();

router.use(requireAuth);

const listQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  severity: z.enum(['info', 'success', 'warning', 'critical']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));
router.patch('/:id/read', asyncHandler(ctrl.markRead));
router.patch('/read-all', asyncHandler(ctrl.markAllRead));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
