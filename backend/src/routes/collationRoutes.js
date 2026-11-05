const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { attachScope } = require('../middleware/scope');
const ctrl = require('../controllers/collationController');

const router = express.Router();

router.use(requireAuth, attachScope);

router.get('/:election/national', asyncHandler(ctrl.getNational));
router.get('/:election/states', asyncHandler(ctrl.listStates));
router.get('/:election/state/:code', asyncHandler(ctrl.getState));
router.get('/:election/lga/:code', asyncHandler(ctrl.getLGA));
router.get('/:election/ward/:code', asyncHandler(ctrl.getWard));
router.get('/:election/pu/:code', asyncHandler(ctrl.getPU));
router.get('/:election/parties', asyncHandler(ctrl.partyRanking));

module.exports = router;
