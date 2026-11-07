const express = require('express');
const mongoose = require('mongoose');
const collationService = require('../services/collationService');
const router = express.Router();

router.get('/:electionId', async (req, res) => {
  try {
    const { electionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(electionId)) {
      return res.status(200).json({ success: false, error: 'Invalid election ID.' });
    }
    
    console.log(`Starting rebuild for ${electionId}`);
    await collationService.rebuildAllForElection(electionId);
    
    res.status(200).json({ success: true, message: 'Election collation rebuilt successfully.' });
  } catch (err) {
    console.error('REBUILD ERROR:', err);
    // Return the exact error to the browser
    res.status(200).json({ 
      success: false, 
      error: err.message, 
      stack: err.stack 
    });
  }
});

module.exports = router;
