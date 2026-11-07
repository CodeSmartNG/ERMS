const mongoose = require('mongoose');

const ELECTION_TYPES = [
  'PRESIDENTIAL',
  'GUBERNATORIAL',
  'SENATORIAL',
  'HOUSE_OF_REPS',
  'STATE_ASSEMBLY',
  'LGA_CHAIRMAN',
  'COUNCILLOR',
];

const ELECTION_STATUSES = ['DRAFT', 'UPCOMING', 'ACTIVE', 'COLLATING', 'PUBLISHED', 'CANCELLED'];

const electionSchema = new mongoose.Schema(
  {
    code:  { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
    title: { type: String, required: true, trim: true },
    type:  { type: String, enum: ELECTION_TYPES, required: true, index: true },

    // Elections scoped to specific states (gubernatorial, senate, etc.).
    // Empty array = national (presidential).
    states: [{ type: mongoose.Schema.Types.ObjectId, ref: 'State', index: true }],

    // Optional constituency scope — LGA list for gubernatorial, ward list for
    // state assembly, etc. Populated by whoever schedules the election.
    scope: {
      level: {
        type: String,
        enum: ['NATIONAL', 'STATE', 'SENATORIAL_DISTRICT', 'FEDERAL_CONSTITUENCY', 'STATE_CONSTITUENCY', 'LGA'],
        default: 'NATIONAL',
      },
      entities: [{ type: mongoose.Schema.Types.ObjectId }],
    },

    electionDate:    { type: Date, required: true, index: true },
    registrationDeadline: { type: Date, default: null },
    resultsDeadline: { type: Date, default: null },

    status: {
      type: String,
      enum: ELECTION_STATUSES,
      default: 'DRAFT',
      index: true,
    },

    // Freeze window: after PUBLISHED, no more submissions accepted.
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    description: { type: String, trim: true, maxlength: 2000, default: null },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

electionSchema.index({ electionDate: -1, status: 1 });
electionSchema.index({ type: 1, electionDate: -1 });

electionSchema.pre('validate', function (next) {
  if (this.type === 'PRESIDENTIAL' && this.states?.length > 0) {
    return next(new Error('Presidential elections must not be scoped to specific states'));
  }
  
  // NEW: Only require states if the election is NOT a DRAFT.
  // This allows creating the election first, then assigning states later.
  if (this.status !== 'DRAFT' && this.type !== 'PRESIDENTIAL' && (!this.states || this.states.length === 0)) {
    return next(new Error(`${this.type} election must specify at least one state`));
  }
  
  next();
});

module.exports = mongoose.model('Election', electionSchema);
module.exports.ELECTION_TYPES = ELECTION_TYPES;
module.exports.ELECTION_STATUSES = ELECTION_STATUSES;
