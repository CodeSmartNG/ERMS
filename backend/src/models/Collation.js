const mongoose = require('mongoose');
const crypto = require('crypto');

const LEVELS = ['WARD', 'LGA', 'STATE', 'NATIONAL'];

// =====================================================================
// Sub-schemas
// =====================================================================

const partyTotalSchema = new mongoose.Schema(
  {
    party:     { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    partyCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 15 },
    votes:     { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// Snapshot of the leading party for the entity — eliminates the need to
// sort partyTotals on every dashboard read.
const leadingPartySchema = new mongoose.Schema(
  {
    party:     { type: mongoose.Schema.Types.ObjectId, ref: 'Party', default: null },
    partyCode: { type: String, default: null, uppercase: true },
    votes:     { type: Number, default: 0, min: 0 },
    percentage:{ type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false }
);

// =====================================================================
// Main schema
// =====================================================================

const collationSchema = new mongoose.Schema(
  {
    election: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Election',
      required: true,
      index: true,
    },

    level: { type: String, enum: LEVELS, required: true, index: true },

    // Entity being collated:
    //   WARD     → Ward._id / ward.code
    //   LGA      → LGA._id / lga.code
    //   STATE    → State._id / state.code
    //   NATIONAL → null / null
    entity: { type: mongoose.Schema.Types.ObjectId, default: null },
    entityCode: { type: String, default: null, index: true, uppercase: true },

    // Denormalized names — populated by collationService so reports don't
    // require a second lookup against Ward/LGA/State collections.
    entityName: { type: String, default: null },
    stateName:  { type: String, default: null },
    lgaName:    { type: String, default: null },
    wardName:   { type: String, default: null },

    // Denormalized parent codes for drill-down UI + filter shortcuts
    stateCode: { type: String, default: null, index: true, uppercase: true },
    lgaCode:   { type: String, default: null, index: true, uppercase: true },
    wardCode:  { type: String, default: null, index: true, uppercase: true },

    // Party totals — sorted desc by votes at write time.
    partyTotals: { type: [partyTotalSchema], default: [] },

    // Pre-computed leader for the entity. Always mirrors partyTotals[0].
    leadingParty: { type: leadingPartySchema, default: () => ({}) },

    // Vote roll-ups
    registeredVoters: { type: Number, required: true, min: 0, default: 0 },
    accreditedVoters: { type: Number, required: true, min: 0, default: 0 },
    totalVotesCast:   { type: Number, required: true, min: 0, default: 0 },
    totalValidVotes:  { type: Number, required: true, min: 0, default: 0 },
    rejectedBallots:  { type: Number, default: 0, min: 0 },

    // Coverage metrics
    pollingUnitsTotal:    { type: Number, required: true, min: 0, default: 0 },
    pollingUnitsReported: { type: Number, required: true, min: 0, default: 0 },
    pollingUnitsVerified: { type: Number, required: true, min: 0, default: 0 },
    reportingPercentage:  { type: Number, min: 0, max: 100, default: 0 },

    // Data quality flags — set by computeLevel when inconsistencies detected.
    // The dashboard renders a warning icon when this array is non-empty.
    dataIssues: {
      type: [{
        type: String,
        enum: [
          'votes_exceed_accredited',
          'valid_exceed_cast',
          'party_sum_mismatch',
          'duplicate_party_codes',
          'zero_party_totals',
          'reporting_exceeds_100',
        ],
      }],
      default: [],
    },

    // Aggregation source integrity
    sourceHash:  { type: String, required: true, index: true },
    sourceCount: { type: Number, required: true, min: 0, default: 0 },

    // Authorship + lifecycle
    collatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collatedAt:  { type: Date, default: Date.now, index: true },
    publishedAt: { type: Date, default: null },

    version:   { type: Number, default: 1, min: 1 },
    isCurrent: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

// =====================================================================
// Indexes
// =====================================================================

// One current collation per (election, level, entity).
// MongoDB treats null as a value, so this correctly enforces "one NATIONAL".
collationSchema.index(
  { election: 1, level: 1, entity: 1, isCurrent: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } }
);

// Dashboard hot paths
collationSchema.index({ election: 1, level: 1, 'partyTotals.votes': -1 });
collationSchema.index({ election: 1, level: 1, reportingPercentage: -1 });
collationSchema.index({ election: 1, level: 1, stateCode: 1 });
collationSchema.index({ election: 1, level: 1, lgaCode: 1 });
collationSchema.index({ election: 1, level: 1, wardCode: 1 });

// Most-recent-first listing for history views
collationSchema.index({ election: 1, level: 1, collatedAt: -1 });

// =====================================================================
// Validators
// =====================================================================

collationSchema.pre('validate', function (next) {
  // 1) entityCode must be present for everything except NATIONAL
  if (this.level !== 'NATIONAL' && !this.entityCode) {
    return next(new Error(`entityCode is required for level ${this.level}`));
  }
  if (this.level === 'NATIONAL' && this.entityCode) {
    return next(new Error('entityCode must be null for NATIONAL collation'));
  }

  // 2) entity must be present for everything except NATIONAL
  if (this.level !== 'NATIONAL' && !this.entity) {
    return next(new Error(`entity is required for level ${this.level}`));
  }
  if (this.level === 'NATIONAL' && this.entity) {
    return next(new Error('entity must be null for NATIONAL collation'));
  }

  // 3) No duplicate party codes in partyTotals
  const codes = this.partyTotals.map((p) => p.partyCode);
  if (new Set(codes).size !== codes.length) {
    return next(new Error('partyTotals contains duplicate partyCode entries'));
  }

  // 4) totalValidVotes must equal sum of partyTotals.votes
  const sum = this.partyTotals.reduce((s, p) => s +
