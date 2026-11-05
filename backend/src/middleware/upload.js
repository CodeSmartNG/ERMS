const multer = require('multer');

// Memory storage — we hash the buffer before sending to Cloudinary.
// 8 MB hard limit; the upload controller will re-check and normalize with sharp.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.mimetype)) {
      return cb(new Error('Only image files (JPEG/PNG/WebP/HEIC) are allowed'));
    }
    cb(null, true);
  },
});

module.exports = { uploadEvidence: upload.single('evidence') };
