import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create a single instance of axios with a 60-second timeout (for Render cold starts)
const api = axios.create({ 
  baseURL: BASE_URL, 
  timeout: 60000 
});

// ---- token storage ----
export const tokens = {
  get access()  { return localStorage.getItem('erms.access'); },
  get refresh() { return localStorage.getItem('erms.refresh'); },
  set(access, refresh) {
    if (access)  localStorage.setItem('erms.access', access);
    if (refresh) localStorage.setItem('erms.refresh', refresh);
  },
  clear() {
    localStorage.removeItem('erms.access');
    localStorage.removeItem('erms.refresh');
  },
};

// ---- request: attach access token ----
api.interceptors.request.use((config) => {
  const t = tokens.access;
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// ---- response: refresh on 401 once, then retry ----
let refreshing = null;

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status !== 401 || !original || original._retried) {
      return Promise.reject(error);
    }
    if (
      original.url?.includes('/auth/refresh') ||
      original.url?.includes('/auth/login')
    ) {
      return Promise.reject(error);
    }

    original._retried = true;

    if (!refreshing) {
      refreshing = (async () => {
        const r = tokens.refresh;
        if (!r) throw new Error('No refresh token');
        const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: r });
        tokens.set(res.data.accessToken, res.data.refreshToken);
        return res.data.accessToken;
      })().finally(() => {
        refreshing = null;
      });
    }

    try {
      const newAccess = await refreshing;
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch {
      tokens.clear();
      window.location.assign('/login');
      return Promise.reject(error);
    }
  }
);

export default api;

// ---- typed helpers ----
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  register: (payload) => api.post('/auth/register', payload),
};

export const resultsApi = {
  list: (params) => api.get('/results', { params }),
  get: (id) => api.get(`/results/${id}`),
  verify: (id, notes) => api.patch(`/results/${id}/verify`, { notes }),
  flag: (id, reason) => api.patch(`/results/${id}/flag`, { reason }),
  reject: (id, reason) => api.patch(`/results/${id}/reject`, { reason }),
};

export const incidentsApi = {
  list: (params) => api.get('/incidents', { params }),
  get: (id) => api.get(`/incidents/${id}`),
  assign: (id, assignedTo) => api.patch(`/incidents/${id}/assign`, { assignedTo }),
  updateStatus: (id, status, notes) => api.patch(`/incidents/${id}/status`, { status, notes }),
};

export const collationApi = {
  national: (election) => api.get(`/collation/${election}/national`),
  states: (election) => api.get(`/collation/${election}/states`),
  state: (election, code) => api.get(`/collation/${election}/state/${code}`),
  lga: (election, code) => api.get(`/collation/${election}/lga/${code}`),
  ward: (election, code) => api.get(`/collation/${election}/ward/${code}`),
  pu: (election, code) => api.get(`/collation/${election}/pu/${code}`),
  parties: (election, level) => api.get(`/collation/${election}/parties`, { params: { level } }),
};

export const electionsApi = {
  list: () => api.get('/elections'),
  create: (data) => api.post('/elections', data),
  updateStatus: (id, status) => api.patch(`/elections/${id}/status`, { status }),
};

export const partiesApi = {
  list: () => api.get('/parties'),
  create: (data) => api.post('/parties', data),
};

export const usersApi = {
  register: (data) => api.post('/auth/register', data),
  list: () => api.get('/users'), 
};

export const candidatesApi = {
  list: (electionId) => api.get('/candidates', { params: { election: electionId } }),
  create: (data) => api.post('/candidates', data),
};

// ---- UPDATED GEO API ----
// Notice we added `.then(r => r.data.xxx)` so the page receives a clean array.
export const geoApi = {
  states: () => api.get('/geo/states').then(r => r.data.states),
  lgas: (stateCode) => api.get(`/geo/states/${stateCode}/lgas`).then(r => r.data.lgas),
  wards: (lgaCode) => api.get(`/geo/lgas/${lgaCode}/wards`).then(r => r.data.wards),
  pollingUnits: (wardCode) => api.get(`/geo/wards/${wardCode}/polling-units`).then(r => r.data.pollingUnits),
};

export const reportsApi = {
  // Returns the full download URL for a CSV
  resultsCsvUrl: (electionId) => `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/reports/${electionId}/results.csv`,
  collationCsvUrl: (electionId) => `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/reports/${electionId}/collation.csv`,

  // Helper to download with auth header — browsers don't send auth on <a href>
  download: async (url, filename) => {
    const { tokens } = await import('./api');
    const token = tokens.access;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Download failed' }));
      throw new Error(err.error || 'Download failed');
    }
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  },
};
