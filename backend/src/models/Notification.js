const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'RESULT_SUBMITTED',
  'RESULT_VERIFIED',
  'RESULT_FLAGGED',
  'RESULT_REJECTED',
  'INCIDENT_REPORTED',
  'INCIDENT_ASSIGNED',
  'INCIDENT_RESOLVED',
  'ELECTION_STATUS_CHANGED',
  'SYSTEM_ALERT',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body:  { type: String, trim: true, maxlength: 2000 },

    // Deep-link payload for the frontend
    link: { type: String, default: null },

    // What triggered it
    refModel: { type: String, default: null },
    refId:    { type: mongoose.Schema.Types.ObjectId, default: null },

    severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

// Fast "unread count" and "recent unread" queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

// Auto-expiry — 90 days, keeps collection lean. Adjust as needed.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
