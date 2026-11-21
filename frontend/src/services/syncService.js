
import api from './api';

import {
  QUEUE_STATUS,
  listQueue,
  updateStatus,
  removeFromQueue,
} from './offlineQueue';

let running = false;
let intervalId = null;

function isBlob(value) {
  return (
    typeof Blob !== 'undefined' &&
    value instanceof Blob
  );
}

/**
 * Get all evidence files from a queued record.
 */
function getEvidenceFiles(record) {
  if (
    Array.isArray(record.evidenceFiles) &&
    record.evidenceFiles.length > 0
  ) {
    return record.evidenceFiles;
  }

  // Support old queued records.
  if (record.evidenceBlob) {
    return [{
      blob: record.evidenceBlob,
      name: record.evidenceName || 'evidence.jpg',
    }];
  }

  return [];
}

/**
 * Build multipart form data.
 */
export function buildFormData(record) {
  const fd = new FormData();

  const payload = record.payload || {};

  // Append ordinary submission fields.
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;

    if (value instanceof Blob) {
      fd.append(key, value);
    } else if (typeof value === 'object') {
      fd.append(key, JSON.stringify(value));
    } else {
      fd.append(key, String(value));
    }
  }

  const files = getEvidenceFiles(record);

  if (
    (record.kind === 'result' || record.kind === 'incident') &&
    files.length === 0
  ) {
    throw new Error(
      'Evidence photo is missing from the offline queue. Please capture the photo again.'
    );
  }

  files.forEach((file) => {
    if (!file || !isBlob(file.blob)) {
      throw new Error(
        'Evidence photo is invalid or could not be restored. Please capture it again.'
      );
    }

    const filename = file.name || 'evidence.jpg';

    if (record.kind === 'incident') {
      fd.append('photos', file.blob, filename);
    } else {
      // IMPORTANT: Must match upload.single('evidence') on the backend.
      fd.append('evidence', file.blob, filename);
    }
  });

  return fd;
}

/**
 * Send one queued submission.
 */
async function sendOne(record) {
  const url =
    record.kind === 'result'
      ? '/results'
      : '/incidents';

  try {
    const fd = buildFormData(record);

    await updateStatus(record.localId, {
      status: QUEUE_STATUS.SENDING,
      lastError: null,
    });

    const res = await api.post(url, fd);

    await updateStatus(record.localId, {
      status: QUEUE_STATUS.SENT,
      serverResponse: res.data,
      lastError: null,
    });

    return {
      ok: true,
      response: res.data,
    };
  } catch (err) {
    const status = err.response?.status;

    const message =
      err.response?.data?.error ||
      err.message ||
      'Submission failed';

    // Retry network failures, timeouts, rate limits and server errors.
    // Other 4xx errors remain failed until manually retried.
    const isPermanent =
      status >= 400 &&
      status < 500 &&
      status !== 408 &&
      status !== 429;

    await updateStatus(record.localId, {
      status: isPermanent
        ? QUEUE_STATUS.FAILED
        : QUEUE_STATUS.PENDING,

      attempts: (record.attempts || 0) + 1,
      lastError: message,
    });

    return {
      ok: false,
      permanent: isPermanent,
      error: message,
    };
  }
}

/**
 * Flush pending submissions.
 *
 * Use retryFailed: true when the user manually
 * presses the Retry button.
 */
export async function flushQueue({ retryFailed = false } = {}) {
  if (running) return;

  running = true;

  try {
    const all = await listQueue();

    const eligible = all.filter((record) => {
      if (record.status === QUEUE_STATUS.PENDING) {
        return true;
      }

      if (
        retryFailed &&
        record.status === QUEUE_STATUS.FAILED
      ) {
        return true;
      }

      return false;
    });

    for (const record of eligible) {
      await sendOne(record);
    }
  } finally {
    running = false;
  }
}

/**
 * Start automatic background synchronization.
 */
export function startSyncLoop(onChange) {
  if (intervalId) return () => {};

  const run = () => {
    if (!navigator.onLine) return;

    flushQueue()
      .then(() => onChange?.())
      .catch((err) => {
        console.error('Background sync failed:', err);
      });
  };

  run();

  intervalId = setInterval(run, 15000);

  window.addEventListener('online', run);

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    window.removeEventListener('online', run);
  };
}

export { sendOne, removeFromQueue };
