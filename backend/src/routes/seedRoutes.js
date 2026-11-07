const express = require('express');
const mongoose = require('mongoose');
const models = require('../models');
const collationService = require('../services/collationService');
const router = express.Router();

router.get('/:electionId', async (req, res) => {
  try {
    const electionId = new mongoose.Types.ObjectId(req.params.electionId);

    // 1. Fix the math on all verified results for this election
    const results = await models.Result.find({ election: electionId, status: 'VERIFIED' });
    for (const result of results) {
      const partySum = result.partyVotes.reduce((sum, p) => sum + p.votes, 0);
      result.totalValidVotes = partySum;
      result.totalVotesCast = partySum + (result.rejectedBallots || 0);
      if (result.totalVotesCast > result.accreditedVoters) {
        result.accreditedVoters = result.totalVotesCast;
      }
      await result.save();
    }

    // 2. Wipe out the old broken collations
    await models.Collation.deleteMany({ election: electionId });

    // 3. Rebuild the dashboard data
    await collationService.rebuildAllForElection(electionId);

    // 4. Check if National was created
    const national = await models.Collation.findOne({ election: electionId, level: 'NATIONAL', isCurrent: true }).lean();

    res.status(200).json({ 
      success: true, 
      message: 'Database math fixed and collation rebuilt!',
      nationalCreated: !!national,
      nationalData: national
    });

  } catch (err) {
    console.error('[DEBUG] Rebuild error:', err);
    res.status(200).json({ success: false, error: err.message, stack: err.stack });
  }
});

module.exports = router;
