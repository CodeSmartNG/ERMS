// backend/src/routes/electionRoutes.js (new)
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/electionController');
const router = express.Router();
router.get('/', requireAuth, asyncHandler(ctrl.list));
module.exports = router;
