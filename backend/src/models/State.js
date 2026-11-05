const mongoose = require('mongoose');

const stateSchema = new mongoose.Schema(
  {
    code:       { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 10 },
    name:       { type: String, required: true, trim: true, unique: true },
    slug:       { type: String, required: true, lowercase: true, trim: true, unique: true },
    capital:    { type: String, trim: true, default: null },
    zone: {
      type: String,
      enum: ['NC', 'NE', 'NW', 'SE', 'SW', 'SS', 'FCT'],
      required: true,
    },
    isActive:   { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

stateSchema.index({ name: 'text' });

module.exports = mongoose.model('State', stateSchema);
