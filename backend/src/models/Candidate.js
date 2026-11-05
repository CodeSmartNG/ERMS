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

    // Constituency context — which seat is this candidate running for?
    // For a gubernatorial race, `state` is set; `lga`/`ward` are null.
    // For a state assembly seat, `ward`/`lga` reflect the constituency.
    scope: {
      state: { type: mongoose.Schema.Types.ObjectId, ref: 'State', default: null, index: true },
      lga:   { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',   default: null },
      ward:  { type: mongoose.Schema.Types.ObjectId, ref: 'Ward',  default: null },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

// One candidate per (election, party, scope). Prevents duplicate party entries
// in the same race.
candidateSchema.index(
  { election: 1, party: 1, 'scope.state': 1, 'scope.lga': 1, 'scope.ward': 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('Candidate', candidateSchema);
