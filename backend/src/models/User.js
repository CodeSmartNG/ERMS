const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { ROLES, requiredScopeFields } = require('../utils/roleScope');

const scopeSchema = new mongoose.Schema(
  {
    state:       { type: mongoose.Schema.Types.ObjectId, ref: 'State',        default: null },
    lga:         { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',          default: null },
    ward:        { type: mongoose.Schema.Types.ObjectId, ref: 'Ward',         default: null },
    pollingUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'PollingUnit',  default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password:    { type: String, required: true, select: false },
    firstName:   { type: String, required: true, trim: true, maxlength: 50 },
    lastName:    { type: String, required: true, trim: true, maxlength: 50 },
    phoneNumber: { type: String, trim: true, default: null },

    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    scope: { type: scopeSchema, required: true, default: () => ({}) },

    isActive: { type: Boolean, default: true, index: true },

    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret:  { type: String, select: false, default: null },

    // SHA-256 hashes of active refresh tokens (max 5 concurrent sessions)
    refreshTokenHashes: { type: [String], select: false, default: [] },

    passwordChangedAt: { type: Date, default: null },
    lastLoginAt:       { type: Date, default: null },
    lastLoginIp:       { type: String, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Indexes for scoped listings (used by future admin dashboards)
userSchema.index({ role: 1, 'scope.state': 1 });
userSchema.index({ 'scope.lga': 1 });
userSchema.index({ 'scope.ward': 1 });
userSchema.index({ 'scope.pollingUnit': 1 });

// Enforce role ↔ scope consistency BEFORE validation
userSchema.pre('validate', function (next) {
  const required = requiredScopeFields(this.role);
  for (const field of required) {
    if (!this.scope || !this.scope[field]) {
      return next(new Error(`scope.${field} is required for role ${this.role}`));
    }
  }
  next();
});

// Hash password on create / change
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, env.BCRYPT_ROUNDS);
    this.passwordChangedAt = new Date(Date.now() - 1000);
    next();
  } catch (err) { next(err); }
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never leak sensitive fields — even if caller did .select('+password')
userSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.refreshTokenHashes;
    delete ret.twoFactorSecret;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
