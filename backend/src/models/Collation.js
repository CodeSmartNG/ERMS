const mongoose = require('mongoose');
const crypto = require('crypto');

const LEVELS = ['WARD', 'LGA', 'STATE', 'NATIONAL'];

const STATUSES = [
  'DRAFT',
  'COLLATED',
  'VERIFIED',
  'DISPUTED',
  'PUBLISHED',
];

// =====================================================================
// Sub-schemas
// =====================================================================

const partyTotalSchema = new mongoose.Schema(
  {
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      required: true,
    },
    partyCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 15,
    },
    votes: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const leadingPartySchema = new mongoose.Schema(
  {
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Party',
      default: null,
    },
    partyCode: {
      type: String,
      default: null,
      uppercase: true,
    },
    votes: {
      type: Number,
      default: 0,
      min: 0,
    },
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
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
    level: {
      type: String,
      enum: LEVELS,
      required: true,
      index: true,
    },
    entity: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    entityCode: {
      type: String,
      default: null,
      index: true,
      uppercase: true,
      trim: true,
    },
    entityName: { type: String, default: null },
    stateName: { type: String, default: null },
    lgaName: { type: String, default: null },
    wardName: { type: String, default: null },
    stateCode: { type: String, default: null, index: true, uppercase: true, trim: true },
    lgaCode: { type: String, default: null, index: true, uppercase: true, trim: true },
    wardCode: { type: String, default: null, index: true, uppercase: true, trim: true },

    status: {
      type: String,
      enum: STATUSES,
      default: 'DRAFT',
      index: true,
    },

    partyTotals: {
      type: [partyTotalSchema],
      default: [],
    },
    leadingParty: {
      type: leadingPartySchema,
      default: () => ({}),
    },

    registeredVoters: { type: Number, required: true, min: 0, default: 0 },
    accreditedVoters: { type: Number, required: true, min: 0, default: 0 },
    totalVotesCast:   { type: Number, required: true, min: 0, default: 0 },
    totalValidVotes:  { type: Number, required: true, min: 0, default: 0 },
    rejectedBallots:  { type: Number, default: 0, min: 0 },

    pollingUnitsTotal:    { type: Number, required: true, min: 0, default: 0 },
    pollingUnitsReported: { type: Number, required: true, min: 0, default: 0 },
    pollingUnitsVerified: { type: Number, required: true, min: 0, default: 0 },

    reportingPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

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
          'invalid_vote_relationship',
        ],
      }],
      default: [],
    },

    sourceHash: { type: String, required: true, index: true },
    sourceCount: { type: Number, required: true, min: 0, default: 0 },

    collatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collatedAt: { type: Date, default: Date.now, index: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    disputeReason: { type: String, default: null, trim: true, maxlength: 2000 },

    version:   { type: Number, default: 1, min: 1 },
    isCurrent: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

// =====================================================================
// Indexes
// =====================================================================

collationSchema.index(
  { election: 1, level: 1, entity: 1, isCurrent: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } }
);
collationSchema.index({ election: 1, level: 1, 'partyTotals.votes': -1 });
collationSchema.index({ election: 1, level: 1, reportingPercentage: -1 });
collationSchema.index({ election: 1, level: 1, stateCode: 1 });
collationSchema.index({ election: 1, level: 1, lgaCode: 1 });
collationSchema.index({ election: 1, level: 1, wardCode: 1 });
collationSchema.index({ election: 1, level: 1, collatedAt: -1 });
collationSchema.index({ election: 1, status: 1, isCurrent: 1 });

// =====================================================================
// Validators (Auto-Correcting)
// =====================================================================

collationSchema.pre('validate', function (next) {
  // 1. Entity validation
  if (this.level !== 'NATIONAL' && !this.entityCode) {
    return next(new Error(`entityCode is required for level ${this.level}`));
  }
  if (this.level !== 'NATIONAL' && !this.entity) {
    return next(new Error(`entity is required for level ${this.level}`));
  }

  // 2. Duplicate party validation (This one stays strict)
  const codes = this.partyTotals.map((p) => p.partyCode.toUpperCase());
  if (new Set(codes).size !== codes.length) {
    return next(new Error('partyTotals contains duplicate partyCode entries'));
  }

  // 3. Party votes must equal valid votes (Auto-Correct)
  const partySum = this.partyTotals.reduce((sum, party) => sum + party.votes, 0);
  if (partySum !== this.totalValidVotes) {
    this.totalValidVotes = partySum; // Force valid votes to match the parties
  }

  // 4. Total votes must equal valid votes + rejected (Auto-Correct)
  const expectedCast = this.totalValidVotes + this.rejectedBallots;
  if (this.totalVotesCast !== expectedCast) {
    this.totalVotesCast = expectedCast; // Force the cast total to match
  }

  // 5. Votes cannot exceed accredited voters (Auto-Correct)
  if (this.totalVotesCast > this.accreditedVoters) {
    this.accreditedVoters = this.totalVotesCast; // Force accredited to be at least the cast votes
  }

  // 6. Accredited cannot exceed registered (Auto-Correct)
  if (this.accreditedVoters > this.registeredVoters) {
    this.registeredVoters = this.accreditedVoters;
  }

  // 7. Polling unit validation
  if (this.pollingUnitsVerified > this.pollingUnitsReported) {
    this.pollingUnitsVerified = this.pollingUnitsReported;
  }
  if (this.pollingUnitsReported > this.pollingUnitsTotal) {
    this.pollingUnitsReported = this.pollingUnitsTotal;
  }

  // Calculate percentages & leaders
  this.reportingPercentage = this.pollingUnitsTotal > 0
    ? Math.round((this.pollingUnitsReported / this.pollingUnitsTotal) * 10000) / 100
    : 0;

  this.leadingParty = this.constructor.buildLeadingParty(this.partyTotals, this.totalValidVotes);

  next();
});

// =====================================================================
// Statics
// =====================================================================

collationSchema.statics.computeSourceHash = function (sourceHashes) {
  const sorted = [...sourceHashes].sort();
  const material = sorted.join('|');
  return crypto.createHash('sha256').update(material).digest('hex');
};

collationSchema.statics.findCurrent = function (electionId, level, entityId = null) {
  return this.findOne({ election: electionId, level, entity: entityId || null, isCurrent: true });
};

collationSchema.statics.buildLeadingParty = function (partyTotals, totalValidVotes) {
  if (!partyTotals || partyTotals.length === 0) {
    return { party: null, partyCode: null, votes: 0, percentage: 0 };
  }
  const top = [...partyTotals].sort((a, b) => b.votes - a.votes)[0];
  return {
    party: top.party,
    partyCode: top.partyCode,
    votes: top.votes,
    percentage: totalValidVotes > 0 ? Math.round((top.votes / totalValidVotes) * 10000) / 100 : 0,
  };
};

const Collation = mongoose.model('Collation', collationSchema);
Collation.COLLATION_LEVELS = LEVELS;
Collation.COLLATION_STATUSES = STATUSES;

module.exports = Collation;
