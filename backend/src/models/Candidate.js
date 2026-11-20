const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    party:    { type: mongoose.Schema.Types.ObjectId, ref: 'Party',    required: true, index: true },

    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName:  { type: String, required: true, trim: true, maxlength: 60 },
    otherName: { type: String, trim: true, maxlength: 60, default: null },

    photoUrl:  { type: String, trim: true, default: null },
    age:       { type: Number, min: 18, max: 120, default: null },
    gender:    { type: String, enum: ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'], default: 'UNSPECIFIED' },

    // What office is this candidate contesting?
    // Mirrors Election.type but denormalized for fast lookups + display
    position: {
      type: String,
      enum: [
        'PRESIDENT',
        'GOVERNOR',
        'SENATOR',
        'FEDERAL_HOUSE',
        'STATE_ASSEMBLY',
        'LGA_CHAIRMAN',
        'WARD_COUNCILLOR',
      ],
      required: true,
      index: true,
    },

    // Running mate (VP / Deputy Governor) — required for PRESIDENT/GOVERNOR
    runningMate: {
      firstName: { type: String, trim: true, maxlength: 60, default: null },
      lastName:  { type: String, trim: true, maxlength: 60, default: null },
      otherName: { type: String, trim: true, maxlength: 60, default: null },
      photoUrl:  { type: String, trim: true, default: null },
    },

    // Constituency — which geographic area does this seat represent?
    // (Renamed from `scope` to avoid clashing with Election.scope)
    constituency: {
      state: { type: mongoose.Schema.Types.ObjectId, ref: 'State', default: null, index: true },
      lga:   { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',   default: null },
      ward:  { type: mongoose.Schema.Types.ObjectId, ref: 'Ward',  default: null },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

// One candidate per (election, party, constituency) — prevents duplicate entries
candidateSchema.index(
  { election: 1, party: 1, 'constituency.state': 1, 'constituency.lga': 1, 'constituency.ward': 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

candidateSchema.index({ party: 1, position: 1, isActive: 1 });

// President / Governor must have a running mate
candidateSchema.pre('validate', function (next) {
  const needsRunningMate = ['PRESIDENT', 'GOVERNOR'].includes(this.position);
  if (needsRunningMate && (!this.runningMate?.firstName || !this.runningMate?.lastName)) {
    return next(new Error(`${this.position} candidates require a running mate (firstName + lastName)`));
  }
  next();
});

module.exports = mongoose.model('Candidate', candidateSchema);
