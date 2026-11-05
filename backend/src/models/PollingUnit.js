const mongoose = require('mongoose');

const geoPointSchema = new mongoose.Schema(
  {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number], // [longitude, latitude]
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 2
          && v[0] >= -180 && v[0] <= 180
          && v[1] >= -90  && v[1] <= 90,
        message: 'coordinates must be [lon, lat] within valid ranges',
      },
    },
  },
  { _id: false }
);

const pollingUnitSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
    name: { type: String, required: true, trim: true },

    ward:  { type: mongoose.Schema.Types.ObjectId, ref: 'Ward',  required: true, index: true },
    lga:   { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',   required: true, index: true },
    state: { type: mongoose.Schema.Types.ObjectId, ref: 'State', required: true, index: true },

    // Denormalized codes — used for aggregation grouping and dashboards
    wardCode:   { type: String, required: true, uppercase: true, index: true },
    lgaCode:    { type: String, required: true, uppercase: true, index: true },
    stateCode:  { type: String, required: true, uppercase: true, index: true },

    // The path array is the aggregation workhorse.
    // e.g. ["FC", "FC-AMAC", "FC-AMAC-001", "PU-001"]
    // Use $group: { _id: { $arrayElemAt: ["$path", N] } } for instant roll-ups.
    path: { type: [String], required: true, index: true },

    // Ancestor ObjectIds (State, LGA, Ward) — for scoped find()
    ancestors: {
      state: { type: mongoose.Schema.Types.ObjectId, ref: 'State', required: true },
      lga:   { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',   required: true },
      ward:  { type: mongoose.Schema.Types.ObjectId, ref: 'Ward',  required: true },
    },

    address:      { type: String, trim: true, default: null },
    location:     { type: geoPointSchema, default: null },
    registeredVoters: { type: Number, default: 0, min: 0 },
    isActive:     { type: Boolean, default: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

pollingUnitSchema.index({ location: '2dsphere' }, { sparse: true });
pollingUnitSchema.index({ ward: 1, name: 1 });
pollingUnitSchema.index({ stateCode: 1, lgaCode: 1, wardCode: 1 });
pollingUnitSchema.index({ name: 'text' });

// Enforce consistency: path[0]===stateCode, path[1]===lgaCode, etc.
pollingUnitSchema.pre('validate', function (next) {
  if (this.path && this.path.length !== 4) {
    return next(new Error('path must be [stateCode, lgaCode, wardCode, puCode]'));
  }
  if (this.path) {
    if (this.path[0] !== this.stateCode) return next(new Error('path[0] must equal stateCode'));
    if (this.path[1] !== this.lgaCode)   return next(new Error('path[1] must equal lgaCode'));
    if (this.path[2] !== this.wardCode)  return next(new Error('path[2] must equal wardCode'));
    if (this.path[3] !== this.code)      return next(new Error('path[3] must equal code'));
  }
  next();
});

module.exports = mongoose.model('PollingUnit', pollingUnitSchema);
