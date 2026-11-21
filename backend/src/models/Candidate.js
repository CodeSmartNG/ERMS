const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true, index: true },
    party:    { type: mongoose.Schema.Types.ObjectId, ref: 'Party',    required: true, index: true },

    name:     { type: String, required: true, trim: true },
    position: { type: String, required: true, trim: true },
    photoUrl: { type: String, trim: true, default: null },
    bio:      { type: String, trim: true, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

candidateSchema.index({ election: 1 });
candidateSchema.index({ party: 1 });

module.exports = mongoose.model('Candidate', candidateSchema);
