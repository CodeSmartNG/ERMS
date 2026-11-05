const mongoose = require('mongoose');

const RESULT_STATUSES = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'FLAGGED', 'REJECTED', 'SUPERSEDED'];

const partyVoteSchema = new mongoose.Schema(
  {
    party:    { type: mongoose.Schema.Types.ObjectId, ref: 'Party',     required: true },
    partyCode:{ type: String, required: true, uppercase: true },
    votes:    { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const resultSchema = new mongoose.Schema(
  {
    // ---- Identity ----
    election:    { type: mongoose.Schema.Types.ObjectId, ref: 'Election',    required: true, index: true },
    pollingUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'PollingUnit', required: true, index: true },

    // ---- Denormalized geo (from PollingUnit.path) — enables fast aggregation ----
    state: { type: mongoose.Schema.Types.ObjectId, ref: 'State', required: true, index: true },
    lga:   { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',   required: true, index: true },
    ward:  { type: mongoose.Schema.Types.ObjectId, ref: 'Ward',  required: true, index: true },

    stateCode: { type: String, required: true, uppercase: true, index: true },
    lgaCode:   { type: String, required: true, uppercase: true, index: true },
    wardCode:  { type: String, required: true, uppercase: true, index: true },
    puCode:    { type: String, required: true, uppercase: true, index: true },

    // Same 4-element path as PollingUnit — the aggregation workhorse.
    path: { type: [String], required: true, index: true },

    // ---- Vote data ----
    registeredVoters:  { type: Number, required: true, min: 0 },
    accreditedVoters:  { type: Number, required: true, min: 0 },
    totalVotesCast:    { type: Number, required: true, min: 0 },
    rejectedBallots:   { type: Number, default: 0, min: 0 },
    partyVotes:        { type: [partyVoteSchema], validate: v => Array.isArray(v) && v.length > 0 },

    // Sum of partyVotes — validated to equal totalVotesCast.
    totalValidVotes:   { type: Number, required: true, min: 0 },

    // ---- Evidence ----
    evidence: {
      photoUrl:       { type: String, required: true },      // Cloudinary URL
      photoPublicId:  { type: String, required: true },      // Cloudinary public_id for deletion
      photoHash:      { type: String, required: true },      // SHA-256 of uploaded bytes
      capturedAt:     { type: Date, required: true },
      gps:            { lat: Number, lng: Number, accuracyM: Number },
      deviceId:       { type: String, default: null },
    },

    // ---- Hash chain ----
    // hash = SHA-256( previousHash + JSON.stringify(canonicalPayload) )
    previousHash: { type: String, default: null },
    hash:         { type: String, required: true, index: true },

    // ---- Versioning ----
    version:      { type: Number, default: 1, min: 1 },
    isCurrent:    { type: Boolean, default: true, index: true },
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Result', default: null },
    supersedes:   { type: mongoose.Schema.Types.ObjectId, ref: 'Result', default: null },

    // ---- Workflow ----
    status: {
      type: String,
      enum: RESULT_STATUSES,
      default: 'SUBMITTED',
      index: true,
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submittedAt: { type: Date, default: Date.now, index: true },

    verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt:  { type: Date, default: null },

    flagReason:  { type: String, trim: true, maxlength: 1000, default: null },
    rejectReason:{ type: String, trim: true, maxlength: 1000, default: null },

    // ---- Idempotency ----
    idempotencyKey: { type: String, required: true, index: true },

    notes: { type: String, trim: true, maxlength: 2000, default: null },
  },
  { timestamps: true, versionKey: false }
);

// One current result per (election, PU).
resultSchema.index(
  { election: 1, pollingUnit: 1, isCurrent: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } }
);

// Idempotency: (election, key) unique — resubmission returns same doc.
resultSchema.index({ election: 1, idempotencyKey: 1 }, { unique: true });

// Dashboard hot paths
resultSchema.index({ election: 1, status: 1, 'path.0': 1 }); // state roll-up
resultSchema.index({ election: 1, status: 1, 'path.1': 1 }); // LGA roll-up
resultSchema.index({ election: 1, status: 1, 'path.2': 1 }); // ward roll-up
resultSchema.index({ election: 1, submittedAt: -1 });

// ---- Validation ----
resultSchema.pre('validate', function (next) {
  if (!this.partyVotes?.length) return next(new Error('partyVotes cannot be empty'));

  const sum = this.partyVotes.reduce((s, pv) => s + pv.votes, 0);
  if (sum !== this.totalValidVotes) {
    return next(new Error(`totalValidVotes (${this.totalValidVotes}) must equal sum of partyVotes (${sum})`));
  }
  if (this.totalValidVotes > this.totalVotesCast) {
    return next(new Error('totalValidVotes cannot exceed totalVotesCast'));
  }
  if (this.accreditedVoters > this.registeredVoters) {
    return next(new Error('accreditedVoters cannot exceed registeredVoters'));
  }
  if (this.totalVotesCast > this.accreditedVoters + this.rejectedBallots) {
    return next(new Error('totalVotesCast cannot exceed accreditedVoters + rejectedBallots'));
  }
  if (this.path && this.path.length !== 4) {
    return next(new Error('path must be [stateCode, lgaCode, wardCode, puCode]'));
  }
  next();
});

// ---- Immutability after VERIFIED (or superseded/rejected) ----
const IMMUTABLE_STATUSES = new Set(['VERIFIED', 'SUPERSEDED', 'REJECTED']);
resultSchema.pre('save', function (next) {
  if (this.isNew) return next();
  const prior = this.$__.priorDoc;
  if (prior && IMMUTABLE_STATUSES.has(prior.status)) {
    const changed = this.modifiedPaths().filter((p) => !['__v'].includes(p));
    if (changed.length) {
      return next(new Error(`Cannot modify a ${prior.status} result: ${changed.join(', ')}`));
    }
  }
  next();
});

module.exports = mongoose.model('Result', resultSchema);
module.exports.RESULT_STATUSES = RESULT_STATUSES;
