import { openDB } from 'idb';

const DB_NAME = 'erms-offline';
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('submissions')) {
      const store = db.createObjectStore('submissions', { keyPath: 'localId' });
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

/**
 * Add a submission to the queue.
 * Accepts BOTH `evidenceFiles` (array) and legacy `evidenceBlob` (single file).
 */
export async function enqueue({ kind, payload, evidenceFiles, evidenceBlob, evidenceName }) {
  const db = await dbPromise;
  const localId = crypto.randomUUID();
  
  // Normalize: if caller sends evidenceFiles, use it; else wrap evidenceBlob in array
  const files = evidenceFiles 
    || (evidenceBlob ? [{ blob: evidenceBlob, name: evidenceName || 'evidence.jpg' }] : []);

  const record = {
    localId,
    kind,
    payload,
    evidenceFiles: files,     // <-- new field (always an array)
    evidenceBlob: null,       // <-- keep for backwards compat
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
  const all = await db.getAllFromIndex('submissions', 'createdAt');
  return all;
}

export async function countByStatus() {
  const db = await dbPromise;
  const out = { [QUEUE_STATUS.PENDING]: 0, [QUEUE_STATUS.SENDING]: 0, [QUEUE_STATUS.SENT]: 0, [QUEUE_STATUS.FAILED]: 0 };
  const all = await db.getAll('submissions');
  for (const r of all) out[r.status] = (out[r.status] || 0) + 1;
  return out;
}

export async function updateStatus(localId, patch) {
  const db = await dbPromise;
  const rec = await db.get('submissions', localId);
  if (!rec) return null;
  const next = { ...rec, ...patch };
  await db.put('submissions', next);
  return next;
}

export async function removeFromQueue(localId) {
  const db = await dbPromise;
  await db.delete('submissions', localId);
}

export async function clearQueue() {
  const db = await dbPromise;
  await db.clear('submissions');
}
