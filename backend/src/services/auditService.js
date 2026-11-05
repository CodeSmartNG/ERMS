const AuditLog = require('../models/AuditLog');

/**
 * Fire-and-forget audit writer. Never throws — an audit failure must not
 * break the business flow, but IS logged to stderr for alerting.
 */
async function log({ actor, actorRole, action, entity, entityId, metadata, req, severity }) {
  try {
    await AuditLog.create({
      actor: actor || req?.user?._id || null,
      actorRole: actorRole || req?.user?.role || null,
      action,
      entity: entity || null,
      entityId: entityId ? String(entityId) : null,
      metadata: metadata || {},
      ip: req?.ip || null,
      userAgent: req?.get?.('user-agent') || null,
      severity: severity || 'info',
    });
  } catch (err) {
    console.error('[AUDIT] failed to write log:', err.message);
  }
}

module.exports = { log };
