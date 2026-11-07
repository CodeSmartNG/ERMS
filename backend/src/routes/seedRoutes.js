const express = require('express');
const mongoose = require('mongoose');
const models = require('../models');
const router = express.Router();

router.get('/:electionId', async (req, res) => {
  try {
    const electionId = new mongoose.Types.ObjectId(req.params.electionId);

    // 1. Check how many results are saved and verified
    const allResults = await models.Result.countDocuments({ election: electionId, isCurrent: true });
    const verifiedResults = await models.Result.countDocuments({ election: electionId, isCurrent: true, status: 'VERIFIED' });
    
    // 2. Check if any collation documents exist at all
    const collations = await models.Collation.find({ election: electionId }).lean();

    res.status(200).json({
      success: true,
      debug: {
        totalCurrentResults: allResults,
        totalVerifiedResults: verifiedResults,
        collationsInDb: collations.length,
        sampleCollation: collations.length > 0 ? collations[0] : null,
        verifiedResultSample: verifiedResults > 0 ? await models.Result.findOne({ election: electionId, isCurrent: true, status: 'VERIFIED' }).lean() : null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
