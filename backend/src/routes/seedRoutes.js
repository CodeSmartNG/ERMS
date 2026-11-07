const express = require('express');
const mongoose = require('mongoose');
const models = require('../models');
const collationService = require('../services/collationService');
const router = express.Router();

router.get('/:electionId', async (req, res) => {
  try {
    const electionIdStr = req.params.electionId;
    
    if (!mongoose.Types.ObjectId.isValid(electionIdStr)) {
      return res.status(400).json({ error: 'Invalid election ID format.' });
    }
    
    const electionId = new mongoose.Types.ObjectId(electionIdStr);

    // 1. Check database connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: 'Database is not connected.' });
    }

    // 2. Check if there are verified results
    const resultsCount = await models.Result.countDocuments({ 
      election: electionId, 
      isCurrent: true, 
      status: 'VERIFIED' 
    });

    if (resultsCount === 0) {
      return res.status(400).json({ error: 'No VERIFIED results found for this election in the database.' });
    }

    // 3. Run the rebuild
    await collationService.rebuildAllForElection(electionId);
    
    res.json({ 
      success: true, 
      message: `Found ${resultsCount} verified results. Collation rebuilt successfully!` 
    });

  } catch (err) {
    console.error('SEED ROUTE ERROR:', err);
    // This forces the error to show on your screen
    res.status(500).json({ 
      error: err.message,
      stack: err.stack
    });
  }
});

module.exports = router;
