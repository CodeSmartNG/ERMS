const mongoose = require('mongoose');

const wardSchema = new mongoose.Schema(
  {
    // INCREASED maxlength from 20 to 100 to prevent seed crashes
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true },

    lga:   { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',   required: true, index: true },
    state: { type: mongoose.Schema.Types.ObjectId, ref: 'State', required: true, index: true },

    // Denormalized codes for aggregation + display
    lgaCode:   { type: String, required: true, uppercase: true, index: true },
    stateCode: { type: String, required: true, uppercase: true, index: true },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

wardSchema.index({ lga: 1, name: 1 }, { unique: true });
wardSchema.index({ state: 1, lga: 1 });
wardSchema.index({ name: 'text' });

module.exports = mongoose.model('Ward', wardSchema);
