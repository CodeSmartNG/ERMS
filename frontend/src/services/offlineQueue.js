
import { openDB } from 'idb';

const DB_NAME = 'erms-offline';
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('submissions')) {
      const store = db.createObjectStore('submissions', {
        keyPath: 'localId',
      });

      store.createIndex('status', 'status');
      store.createIndex('createdAt', 'createdAt');
    }
  },
});

export const QUEUE_STATUS = {
  PENDING: 'PENDING',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
};

function isBlob(value) {
  return (
    typeof Blob !== 'undefined' &&
    value instanceof Blob
  );
}

function normalizeFiles(evidenceFiles, evidenceBlob, evidenceName) {
  if (Array.isArray(evidenceFiles) && evidenceFiles.length > 0) {
    return evidenceFiles.map((file) => {
      if (!file || !isBlob(file.blob)) {
        throw new Error(
          'Invalid evidence photo. Please select the photo again.'
        );
      }

      return {
        blob: file.blob,
        name: file.name || 'evidence.jpg',
        type: file.blob.type || 'image/jpeg',
      };
    });
  }

  if (evidenceBlob) {
    if (!isBlob(evidenceBlob)) {
      throw new Error('Invalid evidence photo.');
    }

    return [{
      blob: evidenceBlob,
      name: evidenceName || 'evidence.jpg',
      type: evidenceBlob.type || 'image/jpeg',
    }];
  }

  return [];
}

/**
 * Save a submission locally.
 * Supports both new and legacy evidence formats.
 */
export async function enqueue({
  kind,
  payload,
  evidenceFiles,
  evidenceBlob,
  evidenceName,
}) {
  if (!kind) {
    throw new Error('Submission type is required.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Submission payload is required.');
  }

  const files = normalizeFiles(
    evidenceFiles,
    evidenceBlob,
    evidenceName
  );

  if (
    (kind === 'result' || kind === 'incident') &&
    files.length === 0
  ) {
    throw new Error('Please attach an evidence photo.');
  }

  const db = await dbPromise;
  const localId = crypto.randomUUID();

  const record = {
    localId,
    kind,
    payload,
    evidenceFiles: files,

    // Legacy compatibility
    evidenceBlob: null,
    evidenceName: null,

    status: QUEUE_STATUS.PENDING,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    serverResponse: null,
  };

  await db.put('submissions', record);

  return record;
}

export async function listQueue() {
  const db = await dbPromise;

  const all = await db.getAllFromIndex(
    'submissions',
    'createdAt'
  );

  return all;
}

export async function countByStatus() {
  const db = await dbPromise;

  const out = {
    [QUEUE_STATUS.PENDING]: 0,
    [QUEUE_STATUS.SENDING]: 0,
    [QUEUE_STATUS.SENT]: 0,
    [QUEUE_STATUS.FAILED]: 0,
  };

  const all = await db.getAll('submissions');

  for (const record of all) {
    out[record.status] = (out[record.status] || 0) + 1;
  }

  return out;
}

export async function updateStatus(localId, patch) {
  const db = await dbPromise;

  const record = await db.get('submissions', localId);

  if (!record) return null;

  const updated = {
    ...record,
    ...patch,
  };

  await db.put('submissions', updated);

  return updated;
}

export async function removeFromQueue(localId) {
  const db = await dbPromise;
  await db.delete('submissions', localId);
}

export async function clearQueue() {
  const db = await dbPromise;
  await db.clear('submissions');
}
