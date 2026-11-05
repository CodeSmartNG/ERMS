const mongoose = require('mongoose');

const LEVELS = ['WARD', 'LGA', 'STATE', 'NATIONAL'];

const partyTotalSchema = new mongoose.Schema(
  { partyCode: String, party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party' }, votes: Number },
  { _id: false }
);

const collationSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },

    level:    { type: String, enum: LEVELS, required: true, index: true },

    // The entity being collated (LGA/State doc, or null for NATIONAL).
    entity:   { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    entityCode: { type: String, default: null, index: true },

    // Aggregated vote totals — one entry per party, sorted by votes desc.
    partyTotals: { type: [partyTotalSchema], required: true },

    // Meta
    registeredVoters: { type: Number, required: true, min: 0 },
    accreditedVoters: { type: Number, required: true, min: 0 },
    totalVotesCast:   { type: Number, required: true, min: 0 },
    totalValidVotes:  { type: Number, required: true, min: 0 },
    rejectedBallots:  { type: Number, default: 0, min: 0 },

    pollingUnitsTotal:    { type: Number, required: true, min: 0 },
    pollingUnitsReported: { type: Number, required: true, min: 0 },
    pollingUnitsVerified: { type: Number, default: 0, min: 0 },

    // Percentage of PUs reported: computed at write time so dashboards can sort.
    reportingPercentage: { type: Number, min: 0, max: 100, default: 0 },

    // Hash of the underlying verified results — used for audit/replay.
    sourceHash: { type: String, required: true },

    collatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    collatedAt: { type: Date, default: Date.now, index: true },

    // Version: collations can be recomputed as more PUs report
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

collationSchema.index({ election: 1, level: 1, collatedAt: -1 });

module.exports = mongoose.model('Collation', collationSchema);
module.exports.COLLATION_LEVELS = LEVELS;
