const mongoose = require('mongoose');

const lgaSchema = new mongoose.Schema(
  {
    code:    { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 15 },
    name:    { type: String, required: true, trim: true },

    state:   { type: mongoose.Schema.Types.ObjectId, ref: 'State', required: true, index: true },

    // Denormalized for aggregation without $lookup
    stateCode: { type: String, required: true, uppercase: true, index: true },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

// LGAs are unique per (state, name) — same name can exist in different states.
lgaSchema.index({ state: 1, name: 1 }, { unique: true });
lgaSchema.index({ state: 1, name: 'text' });

module.exports = mongoose.model('LGA', lgaSchema);
