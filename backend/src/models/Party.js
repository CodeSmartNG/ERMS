const mongoose = require('mongoose');

// Parties are global (not per-election) — they exist across cycles.
const partySchema = new mongoose.Schema(
  {
    // ... everything you already have ...

    // ⬇️ NEW — for multi-tenant + audit
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      default: null,
      // null = legacy/seeded party, non-null = created via UI
    },
    // Optional: if a party is only active in specific states
    // (e.g., a regional party like APGA in Anambra only)
    activeStates: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'State' 
    }],
  },
  { timestamps: true, versionKey: false }
);

partySchema.index({ name: 'text', abbreviation: 'text' });

module.exports = mongoose.model('Party', partySchema);
