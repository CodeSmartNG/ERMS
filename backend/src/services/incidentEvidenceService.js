const crypto = require('crypto');
const { cloudinary } = require('../config/cloudinary');
const { prepareImage } = require('./evidenceService');
const ApiError = require('../utils/ApiError');

const INCIDENT_FOLDER = process.env.CLOUDINARY_INCIDENT_FOLDER || 'codesmartng-erms/incidents';
const MAX_PHOTOS = 5;
const MAX_VIDEOS = 1;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30 MB

/**
 * Uploads all photos (prepared via sharp) and returns:
 *   [{ url, publicId, hash, capturedAt }]
 *
 * public_id is deterministic on (incidentIdempotencyKey, index) so a retry
 * overwrites rather than duplicates.
 */
async function uploadIncidentPhotos({ files, idempotencyKey }) {
  if (!files || files.length === 0) return [];
  if (files.length > MAX_PHOTOS) {
    throw ApiError.badRequest(`At most ${MAX_PHOTOS} photos per incident`);
  }

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const { buffer, hash } = await prepareImage(file.buffer);
    const publicId = `${idempotencyKey}_${i}`;

    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: INCIDENT_FOLDER,
          public_id: publicId,
          resource_type: 'image',
          overwrite: true,
          invalidate: true,
          format: 'jpg',
          tags: ['erms', 'incident'],
          context: { hash },
        },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(buffer);
    });

    results.push({
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      hash,
    });
  }
  return results;
}

/**
 * Video upload — no re-encode (would be slow and lossy for evidence),
 * just SHA-256 the original bytes and stream to Cloudinary.
 */
async function uploadIncidentVideos({ files, idempotencyKey }) {
  if (!files || files.length === 0) return [];
  if (files.length > MAX_VIDEOS) {
    throw ApiError.badRequest(`At most ${MAX_VIDEOS} video per incident`);
  }

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > MAX_VIDEO_BYTES) {
      throw ApiError.badRequest(`Video exceeds ${MAX_VIDEO_BYTES / 1024 / 1024}MB`);
    }
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const publicId = `${idempotencyKey}_vid_${i}`;

    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: INCIDENT_FOLDER,
          public_id: publicId,
          resource_type: 'video',
          overwrite: true,
          invalidate: true,
          tags: ['erms', 'incident'],
          context: { hash },
        },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(file.buffer);
    });

    results.push({
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      hash,
    });
  }
  return results;
}

async function deleteEvidence(publicIds = []) {
  for (const publicId of publicIds) {
    try {
      await cloudinary.uploader.destroy(publicId, { invalidate: true });
    } catch (err) {
      console.error('[CLOUDINARY] incident evidence delete failed:', err.message);
    }
  }
}

module.exports = {
  uploadIncidentPhotos,
  uploadIncidentVideos,
  deleteEvidence,
  MAX_PHOTOS,
  MAX_VIDEOS,
};
