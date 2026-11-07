
const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const collationService = require('../services/collationService');

const router = express.Router();

// Rebuilding election collation requires administrator access.
router.post(
  '/:electionId',
  requireAuth,
  requireRole('super_admin', 'national_admin'),
  asyncHandler(async (req, res) => {
    const { electionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(electionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid election ID.',
      });
    }

    await collationService.rebuildAllForElection(
      new mongoose.Types.ObjectId(electionId)
    );

    res.json({
      success: true,
      message: 'Election collation rebuilt successfully.',
    });
  })
);

module.exports = router;
