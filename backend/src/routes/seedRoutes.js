const express = require('express');
const mongoose = require('mongoose');
const models = require('../models');
const collationService = require('../services/collationService');
const router = express.Router();

router.get('/:electionId', async (req, res) => {
  try {
    const electionId = new mongoose.Types.ObjectId(req.params.electionId);
    
    // 1. Delete all old collation records so we start fresh
    await models.Collation.deleteMany({ election: electionId });
    console.log('[DEBUG] Cleared old collations.');

    // 2. Run the rebuild
    await collationService.rebuildAllForElection(electionId);

    // 3. Check what got saved
    const savedCollations = await models.Collation.find({ 
      election: electionId, 
      isCurrent: true 
    }).lean();

    res.status(200).json({ 
      success: true, 
      message: 'Rebuild complete. Cleared old data first.',
      levelsSaved: savedCollations.map(c => c.level)
    });

  } catch (err) {
    console.error('[DEBUG] Rebuild error:', err);
    res.status(200).json({ success: false, error: err.message, stack: err.stack });
  }
});

module.exports = router;
