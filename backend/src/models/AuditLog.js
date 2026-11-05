const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole:  { type: String, default: null },        // snapshot; role may change later
    action:     { type: String, required: true, index: true },
    entity:     { type: String, default: null, index: true },
    entityId:   { type: String, default: null, index: true },
    metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },
    ip:         { type: String, default: null },
    userAgent:  { type: String, default: null },
    severity:   { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
    timestamp:  { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

// Append-only enforcement — every mutation path throws.
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne',
 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) => {
  auditLogSchema.pre(op, function () {
    throw new Error('AuditLog is append-only');
  });
});
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('AuditLog is append-only'));
  next();
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
