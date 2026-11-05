const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/geoController');

const router = express.Router();

// All geo lookups require auth (they expose registered-voter counts on PUs),
// but no scope check — everyone can see the full tree. Scope is enforced
// only when *acting on* an entity (submitting results, managing users, etc.).
router.use(requireAuth);

router.get('/states', asyncHandler(ctrl.listStates));
router.get('/states/:code/lgas', asyncHandler(ctrl.listLGAs));
router.get('/lgas/:code/wards', asyncHandler(ctrl.listWards));
router.get('/wards/:code/polling-units', asyncHandler(ctrl.listPollingUnits));

module.exports = router;
