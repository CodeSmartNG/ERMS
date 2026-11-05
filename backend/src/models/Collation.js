const mongoose = require('mongoose');
const crypto = require('crypto');

const LEVELS = ['WARD', 'LGA', 'STATE', 'NATIONAL'];

const partyTotalSchema = new mongoose.Schema(
  {
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    partyCode: { type: String, required: true, uppercase: true },
    votes: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const collationSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },

    level: { type: String, enum: LEVELS, required: true, index: true },

    // Entity being collated:
    //   WARD     → Ward._id / ward.code
    //   LGA      → LGA._id / lga.code
    //   STATE    → State._id / state.code
    //   NATIONAL → null / null
    entity: { type: mongoose.Schema.Types.ObjectId, default: null },
    entityCode: { type: String, default: null, index: true },

    // Denormalized parent codes for drill-down UI
    stateCode: { type: String, default: null, index: true },
    lgaCode: { type: String, default: null, index: true },
    wardCode: { type: String, default: null, index: true },

    // Party totals — sorted desc by votes
    partyTotals: { type: [partyTotalSchema], default: [] },

    // Vote roll-ups
    registeredVoters: { type: Number, required: true, min: 0, default: 0 },
    accreditedVoters: { type: Number, required: true, min: 0, default: 0 },
    totalVotesCast: { type: Number, required: true, min: 0, default: 0 },
    totalValidVotes: { type: Number, required: true, min: 0, default: 0 },
    rejectedBallots: { type: Number, default: 0, min: 0 },

    // Coverage metrics
    pollingUnitsTotal: { type: Number, required: true, min: 0, default: 0 },
    pollingUnitsReported: { type: Number, required: true, min: 0, default: 0 },
    pollingUnitsVerified: { type: Number, required: true, min: 0, default: 0 },
    reportingPercentage: { type: Number, min: 0, max: 100, default: 0 },

    // Aggregation source integrity
    sourceHash: { type: String, required: true, index: true },
    sourceCount: { type: Number, required: true, min: 0, default: 0 }, // # of PUs contributing

    collatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collatedAt: { type: Date, default: Date.now, index: true },

    version: { type: Number, default: 1 },
    isCurrent: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

// One current collation per (election, level, entity)
collationSchema.index(
  { election: 1, level: 1, entity: 1, isCurrent: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } }
);

// Dashboard hot paths
collationSchema.index({ election: 1, level: 1, 'partyTotals.votes': -1 });
collationSchema.index({ election: 1, level: 1, reportingPercentage: -1 });
collationSchema.index({ election: 1, stateCode: 1, level: 1 });

/** Deterministic hash of a sorted list of source hashes. */
collationSchema.statics.computeSourceHash = function (sourceHashes) {
  const sorted = [...sourceHashes].sort();
  const material = sorted.join('|');
  return crypto.createHash('sha256').update(material).digest('hex');
};

module.exports = mongoose.model('Collation', collationSchema);
module.exports.COLLATION_LEVELS = LEVELS;
