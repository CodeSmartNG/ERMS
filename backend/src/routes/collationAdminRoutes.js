const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { attachScope } = require('../middleware/scope');
const { ROLES } = require('../utils/roleScope');
const collationService = require('../services/collationService');
const models = require('../models');
const ApiError = require('../utils/ApiError');
const audit = require('../services/auditService');

const router = express.Router();
router.use(requireAuth, attachScope);

// POST /api/collation-admin/:election/rebuild-all — super admin only
router.post(
  '/:election/rebuild-all',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    await audit.log({
      actor: req.user._id, actorRole: req.user.role,
      action: 'COLLATION_FULL_REBUILD_STARTED',
      entity: 'Election', entityId: req.params.election, req,
      severity: 'warning',
    });

    // Fire-and-forget; endpoint returns immediately with acknowledgment.
    collationService.rebuildAllForElection(req.params.election, req.user._id)
      .then(() => audit.log({
        actor: req.user._id, actorRole: req.user.role,
        action: 'COLLATION_FULL_REBUILD_COMPLETED',
        entity: 'Election', entityId: req.params.election, req,
      }))
      .catch((err) => audit.log({
        actor: req.user._id, actorRole: req.user.role,
        action: 'COLLATION_FULL_REBUILD_FAILED',
        entity: 'Election', entityId: req.params.election,
        metadata: { error: err.message }, req, severity: 'critical',
      }));

    res.json({ message: 'Rebuild started', election: req.params.election });
  })
);

// POST /api/collation-admin/:id/verify — recompute sourceHash and compare
router.post(
  '/:id/verify',
  requireRole(ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN),
  asyncHandler(async (req, res) => {
    const collation = await models.Collation.findById(req.params.id).lean();
    if (!collation) throw ApiError.notFound('Collation not found');
    // Super admin only for cross-state; state admin only their state
    if (req.user.role === ROLES.STATE_ADMIN && collation.stateCode) {
      const state = await models.State.findById(req.user.scope.state).lean();
      if (state.code !== collation.stateCode) {
        throw ApiError.forbidden('Outside your state');
      }
    }

    const result = await collationService.verifyCollation(req.params.id);

    await audit.log({
      actor: req.user._id, actorRole: req.user.role,
      action: 'COLLATION_VERIFIED',
      entity: 'Collation', entityId: req.params.id,
      metadata: { ok: result.ok, expected: result.expected, actual: result.actual },
      req, severity: result.ok ? 'info' : 'critical',
    });

    res.json(result);
  })
);

module.exports = router;
