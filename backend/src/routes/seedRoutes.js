const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const collationService = require('../services/collationService');
const router = express.Router();

router.get('/:electionId', asyncHandler(async (req, res) => {
  try {
    // Convert the URL string into a real MongoDB ObjectId
    const electionId = new mongoose.Types.ObjectId(req.params.electionId);
    
    await collationService.rebuildAllForElection(electionId);
    res.json({ success: true, message: 'Collation rebuilt successfully! Check your dashboard.' });
  } catch (err) {
    console.error('Rebuild error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}));

module.exports = router;
