import api from './api';

// Placeholder — the backend does not expose a notifications endpoint yet.
// For now, this is a no-op that returns empty data so the UI renders.
// Wire to a real endpoint when ready (see notes at end of this message).
export const notificationsApi = {
  list: async () => {
    try {
      const res = await api.get('/notifications');
      return res.data;
    } catch {
      return { notifications: [], unread: 0 };
    }
  },
  markRead: async (id) => {
    try { await api.patch(`/notifications/${id}/read`); } catch { /* noop */ }
  },
};
