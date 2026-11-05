import api from './api';
import {
  QUEUE_STATUS,
  listQueue,
  updateStatus,
  removeFromQueue,
} from './offlineQueue';

let running = false;
let intervalId = null;

/**
 * Builds a multipart body from a queued submission.
 */
function buildFormData(record) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(record.payload)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') fd.append(k, JSON.stringify(v));
    else fd.append(k, String(v));
  }
  if (record.evidenceBlob) {
    fd.append('evidence', record.evidenceBlob, record.evidenceName || 'evidence.jpg');
  }
  return fd;
}

async function sendOne(record) {
  const url = record.kind === 'result' ? '/results' : '/incidents';
  const fd = buildFormData(record);

  await updateStatus(record.localId, { status: QUEUE_STATUS.SENDING });
  try {
    const res = await api.post(url, fd);
    await updateStatus(record.localId, {
      status: QUEUE_STATUS.SENT,
      serverResponse: res.data,
      lastError: null,
    });
    return { ok: true, response: res.data };
  } catch (err) {
    const status = err.response?.status;
    const message = err.response?.data?.error || err.message;
    // 4xx (except 408/429) = permanent; retrying won't help
    const permanent = status && status >= 400 && status < 500 && status !== 408 && status !== 429;
    await updateStatus(record.localId, {
      status: permanent ? QUEUE_STATUS.FAILED : QUEUE_STATUS.PENDING,
      attempts: record.attempts + 1,
      lastError: message,
    });
    return { ok: false, permanent, error: message };
  }
}

/**
 * Flush every PENDING submission. Fire-and-forget from the UI.
 */
export async function flushQueue() {
  if (running) return;
  running = true;
  try {
    const all = await listQueue();
    const pending = all.filter((r) => r.status === QUEUE_STATUS.PENDING);
    for (const rec of pending) {
      const result = await sendOne(rec);
      if (result.ok) {
        // Keep SENT records around for one session so the agent can see success
        // and copy the server id. Purge them on next app launch.
      }
    }
  } finally {
    running = false;
  }
}

/** Start background flush — runs on interval + when online event fires. */
export function startSyncLoop(onChange) {
  if (intervalId) return () => {};

  const run = () => {
    if (navigator.onLine) {
      flushQueue().then(() => onChange?.()).catch(() => {});
    }
  };

  run();
  intervalId = setInterval(run, 15000);
  window.addEventListener('online', run);

  return () => {
    clearInterval(intervalId);
    intervalId = null;
    window.removeEventListener('online', run);
  };
}

export { sendOne, removeFromQueue };
