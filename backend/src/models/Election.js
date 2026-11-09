const mongoose = require('mongoose');

const ELECTION_LEVELS = ['FEDERAL', 'STATE', 'LOCAL_GOVERNMENT', 'WARD'];

const ELECTION_TYPES = [
  // FEDERAL LEVEL
  'PRESIDENT', 'SENATOR', 'HOUSE_OF_REPS',
  // STATE LEVEL
  'GOVERNOR', 'STATE_ASSEMBLY',
  // LOCAL GOVERNMENT LEVEL
  'LGA_CHAIRMAN',
  // WARD LEVEL
  'COUNCILLOR'
];

const ELECTION_STATUSES = ['DRAFT', 'UPCOMING', 'ACTIVE', 'COLLATING', 'PUBLISHED', 'CANCELLED'];

const electionSchema = new mongoose.Schema(
  {
    code:  { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
    title: { type: String, required: true, trim: true },
    
    // e.g. FEDERAL, STATE, LOCAL_GOVERNMENT, WARD
    level: { type: String, enum: ELECTION_LEVELS, required: true, index: true },
    
    // e.g. PRESIDENT, GOVERNOR, LGA_CHAIRMAN
    type:  { type: String, enum: ELECTION_TYPES, required: true, index: true },

    // Geographic Scope (only the relevant ones will be populated)
    state: { type: mongoose.Schema.Types.ObjectId, ref: 'State', default: null, index: true },
    lga:   { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',   default: null, index: true },
    ward:  { type: mongoose.Schema.Types.ObjectId, ref: 'Ward',  default: null, index: true },

    electionDate: { type: Date, required: true, index: true },
    
    status: {
      type: String,
      enum: ELECTION_STATUSES,
      default: 'DRAFT',
      index: true,
    },

    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

// Validate that the correct geographic scope is attached based on the Level
electionSchema.pre('validate', function (next) {
  // 1. Presidential: No State, LGA, or Ward required
  if (this.level === 'FEDERAL' && this.type === 'PRESIDENT') {
    this.state = null; this.lga = null; this.ward = null;
  } 
  // 2. Senator / Governor / State Assembly: Must have a State
  else if (['SENATOR', 'GOVERNOR', 'STATE_ASSEMBLY'].includes(this.type)) {
    if (!this.state) return next(new Error(`${this.type} elections require a State.`));
    this.lga = null; this.ward = null; // Ensure lower levels are empty
  } 
  // 3. House of Reps / LGA Chairman: Must have State and LGA
  else if (['HOUSE_OF_REPS', 'LGA_CHAIRMAN'].includes(this.type)) {
    if (!this.state || !this.lga) return next(new Error(`${this.type} elections require a State and LGA.`));
    this.ward = null;
  } 
  // 4. Councillor: Must have State, LGA, and Ward
  else if (this.type === 'COUNCILLOR') {
    if (!this.state || !this.lga || !this.ward) return next(new Error('COUNCILLOR elections require a State, LGA, and Ward.'));
  }

  next();
});

electionSchema.index({ electionDate: -1, status: 1 });

module.exports = mongoose.model('Election', electionSchema);
module.exports.ELECTION_TYPES = ELECTION_TYPES;
module.exports.ELECTION_LEVELS = ELECTION_LEVELS;
module.exports.ELECTION_STATUSES = ELECTION_STATUSES;