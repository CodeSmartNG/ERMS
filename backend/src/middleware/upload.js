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

// Incident: up to 5 photos + 1 optional video
const incidentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    const isImage = /^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.mimetype);
    const isVideo = /^video\/(mp4|quicktime|webm|x-matroska)$/i.test(file.mimetype);
    if (!isImage && !isVideo) {
      return cb(new Error('Only image or video files are allowed'));
    }
    cb(null, true);
  },
});

module.exports = {
 uploadEvidence: upload.single('evidence'),
  uploadIncident: incidentUpload.fields([
    { name: 'photos', maxCount: 5 },
    { name: 'videos', maxCount: 1 },
  ]),
};

