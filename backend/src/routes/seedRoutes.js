const express = require('express');
const mongoose = require('mongoose');
const models = require('../models');
const router = express.Router();

router.get('/:electionId', async (req, res) => {
  try {
    const electionId = new mongoose.Types.ObjectId(req.params.electionId);

    // 1. How many verified results exist?
    const resultsCount = await models.Result.countDocuments({ 
      election: electionId, 
      isCurrent: true, 
      status: 'VERIFIED' 
    });
    
    // 2. What are their Ward IDs?
    const wardIds = await models.Result.distinct('ward', { 
      election: electionId, 
      isCurrent: true, 
      status: 'VERIFIED' 
    });
    
    // 3. Do those Wards actually exist in the database?
    const wardDocs = await models.Ward.find({ _id: { $in: wardIds } }).lean();
    
    // 4. What are their LGA IDs?
    const lgaIds = await models.Result.distinct('lga', { 
      election: electionId, 
      isCurrent: true, 
      status: 'VERIFIED' 
    });
    
    // 5. Do those LGAs actually exist?
    const lgaDocs = await models.LGA.find({ _id: { $in: lgaIds } }).lean();

    res.status(200).json({
      success: true,
      debug: {
        verifiedResultsCount: resultsCount,
        wardIdsFound: wardIds,
        wardDocumentsFound: wardDocs.length,
        lgaIdsFound: lgaIds,
        lgaDocumentsFound: lgaDocs.length,
      }
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message, stack: err.stack });
  }
});

module.exports = router;
