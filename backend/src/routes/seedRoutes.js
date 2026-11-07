const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const collationService = require('../services/collationService');
const router = express.Router();

router.get('/:electionId', asyncHandler(async (req, res) => {
  try {
    const { electionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(electionId)) {
      return res.status(400).json({ success: false, message: 'Invalid election ID.' });
    }
    
    await collationService.rebuildAllForElection(electionId);
    
    res.json({ success: true, message: 'Election collation rebuilt successfully.' });
  } catch (err) {
    console.error('Rebuild error:', err);
    // This will send the exact error to your browser instead of a generic 500
    res.status(500).json({ 
      success: false, 
      error: err.message, 
      stack: err.stack 
    });
  }
}));

module.exports = router;
