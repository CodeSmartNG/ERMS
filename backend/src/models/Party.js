const mongoose = require('mongoose');

// Parties are global (not per-election) — they exist across cycles.
const partySchema = new mongoose.Schema(
  {
    code:  { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 15 },
    name:  { type: String, required: true, unique: true, trim: true },
    abbreviation: { type: String, required: true, uppercase: true, trim: true, maxlength: 10 },

    logoUrl: { type: String, trim: true, default: null },
    color:   { type: String, trim: true, default: null }, // hex for UI

    isActive:   { type: Boolean, default: true, index: true },
    registeredAt: { type: Date, default: null },
    deregisteredAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

partySchema.index({ name: 'text', abbreviation: 'text' });

module.exports = mongoose.model('Party', partySchema);
