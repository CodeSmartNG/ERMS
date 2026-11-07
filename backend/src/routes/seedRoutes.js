const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const collationService = require('../services/collationService');

const router = express.Router();

// A temporary GET route to easily trigger a rebuild from the browser
router.get('/:electionId', asyncHandler(async (req, res) => {
  const { electionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(electionId)) {
    return res.status(400).json({ success: false, message: 'Invalid election ID.' });
  }

  await collationService.rebuildAllForElection(
    new mongoose.Types.ObjectId(electionId)
  );

  res.json({
    success: true,
    message: 'Election collation rebuilt successfully. Check your dashboard!',
  });
}));

module.exports = router;
