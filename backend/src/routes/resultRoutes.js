
const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const {
  requireAuth,
  requireRole,
} = require('../middleware/auth');

const { attachScope } = require('../middleware/scope');
const { uploadEvidence } = require('../middleware/upload');
const { ROLES } = require('../utils/roleScope');
const ctrl = require('../controllers/resultController');

const {
  submitResultSchema,
  listResultsSchema,
  verifyResultSchema,
  flagResultSchema,
  rejectResultSchema,
} = require('../validators/resultValidators');

const router = express.Router();

// Authentication and geographical scope
router.use(requireAuth, attachScope);

// ============================================================
// SUBMIT RESULT
// Multipart upload: evidence
// ============================================================

router.post(
  '/',
  requireRole(
    ROLES.POLLING_UNIT_AGENT,
    ROLES.NATIONAL_SUPER_ADMIN
  ),

  // Multer processes the evidence photo first.
  uploadEvidence,

  // Temporary diagnostics: check whether Multer received the file.
  (req, res, next) => {
    console.log('RESULT UPLOAD DIAGNOSTICS:', {
      contentType: req.headers['content-type'],
      hasFile: Boolean(req.file),
      fileField: req.file?.fieldname || null,
      fileName: req.file?.originalname || null,
      fileSize: req.file?.size || 0,
      fileMimeType: req.file?.mimetype || null,
      bodyFields: Object.keys(req.body || {}),
    });

    next();
  },

  // Validate multipart body.
  validate(submitResultSchema, 'body'),

  // Submit result.
  asyncHandler(ctrl.submit)
);

// ============================================================
// LIST RESULTS
// ============================================================

router.get(
  '/',
  validate(listResultsSchema, 'query'),
  asyncHandler(ctrl.list)
);

// ============================================================
// GET ONE RESULT
// ============================================================

router.get(
  '/:id',
  asyncHandler(ctrl.getOne)
);

// ============================================================
// VERIFY RESULT
// ============================================================

router.patch(
  '/:id/verify',

  requireRole(
    ROLES.WARD_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.PARTY_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.NATIONAL_SUPER_ADMIN
  ),

  validate(verifyResultSchema),

  asyncHandler(ctrl.verify)
);

// ============================================================
// FLAG RESULT
// ============================================================

router.patch(
  '/:id/flag',

  requireRole(
    ROLES.WARD_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.NATIONAL_SUPER_ADMIN
  ),

  validate(flagResultSchema),

  asyncHandler(ctrl.flag)
);

// ============================================================
// REJECT RESULT
// ============================================================

router.patch(
  '/:id/reject',

  requireRole(
    ROLES.WARD_ADMIN,
    ROLES.LGA_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.NATIONAL_SUPER_ADMIN
  ),

  validate(rejectResultSchema),

  asyncHandler(ctrl.reject)
);

module.exports = router;
