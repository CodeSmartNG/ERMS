const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const collationService = require('../services/collationService');
const router = express.Router();

router.get('/:electionId', asyncHandler(async (req, res) => {
  try {
    await collationService.rebuildAllForElection(req.params.electionId);
    res.json({ success: true, message: 'Collation rebuilt successfully! Check your dashboard.' });
  } catch (err) {
    console.error('Rebuild error:', err);
    // Send the exact error to the browser
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}));

module.exports = router;
