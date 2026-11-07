
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
      validate: {
        validator: Number.isSafeInteger,
        message: 'Party votes must be a whole number.',
      },
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

    entityName: {
      type: String,
      default: null,
    },

    stateName: {
      type: String,
      default: null,
    },

    lgaName: {
      type: String,
      default: null,
    },

    wardName: {
      type: String,
      default: null,
    },

    stateCode: {
      type: String,
      default: null,
      index: true,
      uppercase: true,
      trim: true,
    },

    lgaCode: {
      type: String,
      default: null,
      index: true,
      uppercase: true,
      trim: true,
    },

    wardCode: {
      type: String,
      default: null,
      index: true,
      uppercase: true,
      trim: true,
    },

    // Result status
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

    registeredVoters: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    accreditedVoters: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    totalVotesCast: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    totalValidVotes: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    rejectedBallots: {
      type: Number,
      default: 0,
      min: 0,
    },

    pollingUnitsTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    pollingUnitsReported: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    pollingUnitsVerified: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    reportingPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    dataIssues: {
      type: [
        {
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
        },
      ],
      default: [],
    },

    sourceHash: {
      type: String,
      required: true,
      index: true,
    },

    sourceCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    collatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    collatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    disputeReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },

    version: {
      type: Number,
      default: 1,
      min: 1,
    },

    isCurrent: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// =====================================================================
// Indexes
// =====================================================================

collationSchema.index(
  { election: 1, level: 1, entity: 1, isCurrent: 1 },
  {
    unique: true,
    partialFilterExpression: { isCurrent: true },
  }
);

collationSchema.index({
  election: 1,
  level: 1,
  'partyTotals.votes': -1,
});

collationSchema.index({
  election: 1,
  level: 1,
  reportingPercentage: -1,
});

collationSchema.index({
  election: 1,
  level: 1,
  stateCode: 1,
});

collationSchema.index({
  election: 1,
  level: 1,
  lgaCode: 1,
});

collationSchema.index({
  election: 1,
  level: 1,
  wardCode: 1,
});

collationSchema.index({
  election: 1,
  level: 1,
  collatedAt: -1,
});

collationSchema.index({
  election: 1,
  status: 1,
  isCurrent: 1,
});

// =====================================================================
// Validators
// =====================================================================

collationSchema.pre('validate', function (next) {
  // Entity validation
  if (this.level !== 'NATIONAL' && !this.entityCode) {
    return next(
      new Error(`entityCode is required for level ${this.level}`)
    );
  }

  if (this.level === 'NATIONAL' && this.entityCode) {
    return next(
      new Error('entityCode must be null for NATIONAL collation')
    );
  }

  if (this.level !== 'NATIONAL' && !this.entity) {
    return next(
      new Error(`entity is required for level ${this.level}`)
    );
  }

  if (this.level === 'NATIONAL' && this.entity) {
    return next(
      new Error('entity must be null for NATIONAL collation')
    );
  }

  // All vote counts must be whole numbers
  const countFields = [
    'registeredVoters',
    'accreditedVoters',
    'totalVotesCast',
    'totalValidVotes',
    'rejectedBallots',
    'pollingUnitsTotal',
    'pollingUnitsReported',
    'pollingUnitsVerified',
  ];

  for (const field of countFields) {
    if (!Number.isSafeInteger(this[field]) || this[field] < 0) {
      return next(
        new Error(`${field} must be a non-negative whole number`)
      );
    }
  }

  // Duplicate party validation
  const codes = this.partyTotals.map((p) =>
    p.partyCode.toUpperCase()
  );

  if (new Set(codes).size !== codes.length) {
    return next(
      new Error('partyTotals contains duplicate partyCode entries')
    );
  }

  // Party votes must equal valid votes
  const partySum = this.partyTotals.reduce(
    (sum, party) => sum + party.votes,
    0
  );

  if (partySum !== this.totalValidVotes) {
    return next(
      new Error(
        `totalValidVotes (${this.totalValidVotes}) must equal party vote sum (${partySum})`
      )
    );
  }

  // Total votes must equal valid votes plus rejected ballots
  if (
    this.totalVotesCast !==
    this.totalValidVotes + this.rejectedBallots
  ) {
    return next(
      new Error(
        'totalVotesCast must equal totalValidVotes + rejectedBallots'
      )
    );
  }

  // Votes cannot exceed accredited voters
  if (this.totalVotesCast > this.accreditedVoters) {
    return next(
      new Error('totalVotesCast cannot exceed accreditedVoters')
    );
  }

  if (this.accreditedVoters > this.registeredVoters) {
    return next(
      new Error('accreditedVoters cannot exceed registeredVoters')
    );
  }

  // Polling unit validation
  if (this.pollingUnitsVerified > this.pollingUnitsReported) {
    return next(
      new Error(
        'pollingUnitsVerified cannot exceed pollingUnitsReported'
      )
    );
  }

  if (this.pollingUnitsReported > this.pollingUnitsTotal) {
    return next(
      new Error(
        'pollingUnitsReported cannot exceed pollingUnitsTotal'
      )
    );
  }

  // Calculate reporting percentage before saving
  this.reportingPercentage =
    this.pollingUnitsTotal > 0
      ? Math.round(
          (this.pollingUnitsReported / this.pollingUnitsTotal) *
            10000
        ) / 100
      : 0;

  // Calculate leading party
  this.leadingParty = this.constructor.buildLeadingParty(
    this.partyTotals,
    this.totalValidVotes
  );

  next();
});

// =====================================================================
// Source hash
// =====================================================================

collationSchema.statics.computeSourceHash = function (sourceHashes) {
  const sorted = [...sourceHashes].sort();
  const material = sorted.join('|');

  return crypto
    .createHash('sha256')
    .update(material)
    .digest('hex');
};

// =====================================================================
// Find current collation
// =====================================================================

collationSchema.statics.findCurrent = function (
  electionId,
  level,
  entityId = null
) {
  return this.findOne({
    election: electionId,
    level,
    entity: entityId || null,
    isCurrent: true,
  });
};

collationSchema.statics.findCurrentByLevel = function (
  electionId,
  level,
  extraFilter = {}
) {
  return this.find({
    election: electionId,
    level,
    isCurrent: true,
    ...extraFilter,
  }).sort({ entityCode: 1 });
};

// =====================================================================
// Leading party calculation
// =====================================================================

collationSchema.statics.buildLeadingParty = function (
  partyTotals,
  totalValidVotes
) {
  if (!partyTotals || partyTotals.length === 0) {
    return {
      party: null,
      partyCode: null,
      votes: 0,
      percentage: 0,
    };
  }

  const top = [...partyTotals].sort(
    (a, b) => b.votes - a.votes
  )[0];

  return {
    party: top.party,
    partyCode: top.partyCode,
    votes: top.votes,
    percentage:
      totalValidVotes > 0
        ? Math.round(
            (top.votes / totalValidVotes) * 10000
          ) / 100
        : 0,
  };
};

// =====================================================================
// Data issue detection
// =====================================================================

collationSchema.statics.detectDataIssues = function (payload) {
  const issues = [];

  const partyTotals = payload.partyTotals || [];

  if (payload.totalVotesCast > payload.accreditedVoters) {
    issues.push('votes_exceed_accredited');
  }

  if (payload.totalValidVotes > payload.totalVotesCast) {
    issues.push('valid_exceed_cast');
  }

  if (
    payload.totalVotesCast !==
    payload.totalValidVotes + payload.rejectedBallots
  ) {
    issues.push('invalid_vote_relationship');
  }

  const partySum = partyTotals.reduce(
    (sum, party) => sum + party.votes,
    0
  );

  if (partySum !== payload.totalValidVotes) {
    issues.push('party_sum_mismatch');
  }

  const codes = partyTotals.map((party) =>
    String(party.partyCode).toUpperCase()
  );

  if (new Set(codes).size !== codes.length) {
    issues.push('duplicate_party_codes');
  }

  if (
    partyTotals.length > 0 &&
    partyTotals.every((party) => party.votes === 0)
  ) {
    issues.push('zero_party_totals');
  }

  if (
    payload.pollingUnitsReported >
    payload.pollingUnitsTotal
  ) {
    issues.push('reporting_exceeds_100');
  }

  return [...new Set(issues)];
};

// =====================================================================
// Exports
// =====================================================================

const Collation = mongoose.model('Collation', collationSchema);

Collation.COLLATION_LEVELS = LEVELS;
Collation.COLLATION_STATUSES = STATUSES;

module.exports = Collation;
