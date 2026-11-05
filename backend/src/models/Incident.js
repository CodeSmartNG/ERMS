const mongoose = require('mongoose');

const INCIDENT_TYPES = [
  'VIOLENCE',
  'BALLOT_SNATCHING',
  'VOTE_BUYING',
  'INTIMIDATION',
  'BVAS_MALFUNCTION',
  'LATE_OPENING',
  'MATERIAL_SHORTAGE',
  'UNREGISTERED_VOTER',
  'UNDERAGE_VOTING',
  'RESULT_TAMPERING',
  'OTHER',
];

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const INCIDENT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];

const incidentSchema = new mongoose.Schema(
  {
    // Reporter context
    reporter:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reporterRole:{ type: String, required: true },

    // Where
    pollingUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'PollingUnit', default: null, index: true },
    ward:        { type: mongoose.Schema.Types.ObjectId, ref: 'Ward',  default: null, index: true },
    lga:         { type: mongoose.Schema.Types.ObjectId, ref: 'LGA',   default: null, index: true },
    state:       { type: mongoose.Schema.Types.ObjectId, ref: 'State', default: null, index: true },

    // Same path structure for aggregation
    path: { type: [String], default: [] },

    election: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', default: null, index: true },

    type:        { type: String, enum: INCIDENT_TYPES, required: true, index: true },
    severity:    { type: String, enum: SEVERITIES, default: 'MEDIUM', index: true },
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },

    occurredAt: { type: Date, required: true, default: Date.now, index: true },

    location: {
      lat:       { type: Number },
      lng:       { type: Number },
      accuracyM: { type: Number },
    },

    evidence: {
      photos: [{
        url:      { type: String, required: true },
        publicId: { type: String, required: true },
        hash:     { type: String, required: true },
      }],
      videos: [{ url: String, publicId: String, hash: String }],
    },

    status: {
      type: String,
      enum: INCIDENT_STATUSES,
      default: 'OPEN',
      index: true,
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    resolution: {
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      resolvedAt: { type: Date, default: null },
      notes:      { type: String, trim: true, maxlength: 2000, default: null },
    },

    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true, versionKey: false }
);

incidentSchema.index({ election: 1, idempotencyKey: 1 }, { unique: true });
incidentSchema.index({ status: 1, severity: -1, occurredAt: -1 });
incidentSchema.index({ election: 1, type: 1, 'path.0': 1 });   // state-level incident counts
incidentSchema.index({ election: 1, type: 1, 'path.1': 1 });   // LGA
incidentSchema.index({ election: 1, type: 1, 'path.2': 1 });   // ward

module.exports = mongoose.model('Incident', incidentSchema);
module.exports.INCIDENT_TYPES = INCIDENT_TYPES;
module.exports.SEVERITIES = SEVERITIES;
module.exports.INCIDENT_STATUSES = INCIDENT_STATUSES;
