const crypto = require('crypto');
const sharp = require('sharp');
const { cloudinary, folder } = require('../config/cloudinary');
const ApiError = require('../utils/ApiError');

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Validates + normalizes an uploaded image buffer.
 * - Rejects non-image / oversized files
 * - Re-encodes to JPEG at max 1600px — strips EXIF and any embedded payload
 * - Returns the normalized buffer + its SHA-256
 */
async function prepareImage(buffer) {
  if (!buffer || buffer.length === 0) throw ApiError.badRequest('Evidence image is empty');
  if (buffer.length > MAX_BYTES) throw ApiError.badRequest(`Evidence image exceeds ${MAX_BYTES / 1024 / 1024}MB`);

  let normalized;
  try {
    normalized = await sharp(buffer)
      .rotate() // respect EXIF orientation before stripping it
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    throw ApiError.badRequest('Evidence image is not a valid image file');
  }

  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return { buffer: normalized, hash };
}

/**
 * Uploads to Cloudinary under a deterministic public_id so a repeated
 * submission with the same idempotency key overwrites rather than duplicates.
 */
async function uploadEvidence({ buffer, hash, electionId, pollingUnitCode, idempotencyKey }) {
  const publicId = [
    electionId.toString(),
    pollingUnitCode,
    idempotencyKey, // deterministic ⇒ idempotent retry
  ].join('_');

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'image',
        overwrite: true,
        invalidate: true,
        format: 'jpg',
        tags: ['erms', 'evidence', `election:${electionId}`, `pu:${pollingUnitCode}`],
        context: { hash },
      },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.end(buffer);
  });

  return {
    photoUrl: result.secure_url,
    photoPublicId: result.public_id,
    photoHash: hash,
  };
}

async function deleteEvidence(publicId) {
  try {
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  } catch (err) {
    // Non-fatal — logged by caller
    console.error('[CLOUDINARY] delete failed:', err.message);
  }
}

module.exports = { prepareImage, uploadEvidence, deleteEvidence };
