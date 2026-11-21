import axios from 'axios';

const BASE_URL =
import.meta.env.VITE_API_URL ||
'http://localhost:5000/api';

// ============================================================
// AXIOS INSTANCE
// ============================================================

const api = axios.create({
baseURL: BASE_URL,
timeout: 60000,
headers: {
'Content-Type': 'application/json',
},
});

// ============================================================
// TOKEN STORAGE
// ============================================================

export const tokens = {
get access() {
return localStorage.getItem('erms.access');
},

get refresh() {
return localStorage.getItem('erms.refresh');
},

set(access, refresh) {
if (access) {
localStorage.setItem('erms.access', access);
}

if (refresh) {  
  localStorage.setItem('erms.refresh', refresh);  
}

},

clear() {
localStorage.removeItem('erms.access');
localStorage.removeItem('erms.refresh');
},
};


// ============================================================
// REQUEST INTERCEPTOR
// ============================================================

api.interceptors.request.use(
  (config) => {
    const token = tokens.access;

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // IMPORTANT:
    // FormData requests must not use application/json.
    // Let the browser/Axios generate multipart/form-data
    // with the correct boundary for photo uploads.

    if (
      typeof FormData !== 'undefined' &&
      config.data instanceof FormData
    ) {
      if (typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
      } else {
        Object.keys(config.headers).forEach((key) => {
          if (key.toLowerCase() === 'content-type') {
            delete config.headers[key];
          }
        });
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);


// ============================================================
// RESPONSE INTERCEPTOR
// AUTOMATIC TOKEN REFRESH
// ============================================================

let refreshing = null;

api.interceptors.response.use(
(response) => response,

async (error) => {
const original = error.config;
const status = error.response?.status;

if (  
  status !== 401 ||  
  !original ||  
  original._retried  
) {  
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
    const refreshToken = tokens.refresh;  

    if (!refreshToken) {  
      throw new Error('No refresh token available');  
    }  

    const response = await axios.post(  
      `${BASE_URL}/auth/refresh`,  
      { refreshToken },  
      { timeout: 60000 }  
    );  

    tokens.set(  
      response.data.accessToken,  
      response.data.refreshToken  
    );  

    return response.data.accessToken;  
  })().finally(() => {  
    refreshing = null;  
  });  
}  

try {  
  const newAccessToken = await refreshing;  

  original.headers = original.headers || {};  

  original.headers.Authorization =  
    `Bearer ${newAccessToken}`;  

  return api(original);  

} catch (refreshError) {  
  tokens.clear();  

  if (window.location.pathname !== '/login') {  
    window.location.assign('/login');  
  }  

  return Promise.reject(refreshError);  
}

}
);

// ============================================================
// DEFAULT API
// ============================================================

export default api;

// ============================================================
// AUTH API
// ============================================================

export const authApi = {
login: (email, password) =>
api.post('/auth/login', {
email: email.trim().toLowerCase(),
password,
}),

me: () =>
api.get('/auth/me'),

logout: (refreshToken) =>
api.post('/auth/logout', {
refreshToken,
}),

register: (payload) =>
api.post('/auth/register', payload),
};

// ============================================================
// RESULTS API
// ============================================================

export const resultsApi = {
list: (params) =>
api.get('/results', { params }),

get: (id) =>
api.get(/results/${id}),

verify: (id, notes) =>
api.patch(/results/${id}/verify, { notes }),

flag: (id, reason) =>
api.patch(/results/${id}/flag, { reason }),

reject: (id, reason) =>
api.patch(/results/${id}/reject, { reason }),
};

// ============================================================
// INCIDENTS API
// ============================================================

export const incidentsApi = {
list: (params) =>
api.get('/incidents', { params }),

mapData: (params) =>
api.get('/incidents/map-data', { params }),

get: (id) =>
api.get(/incidents/${id}),

assign: (id, assignedTo) =>
api.patch(/incidents/${id}/assign, {
assignedTo,
}),

updateStatus: (id, status, notes) =>
api.patch(/incidents/${id}/status, {
status,
notes,
}),
};

// ============================================================
// COLLATION API
// ============================================================

export const collationApi = {
national: (election) =>
api.get(/collation/${election}/national),

states: (election) =>
api.get(/collation/${election}/states),

state: (election, code) =>
api.get(/collation/${election}/state/${code}),

lga: (election, code) =>
api.get(/collation/${election}/lga/${code}),

ward: (election, code) =>
api.get(/collation/${election}/ward/${code}),

pu: (election, code) =>
api.get(/collation/${election}/pu/${code}),

parties: (election, level) =>
api.get(/collation/${election}/parties, {
params: { level },
}),
};

// ============================================================
// ELECTIONS API
// ============================================================

export const electionsApi = {
list: () =>
api.get('/elections'),

create: (data) =>
api.post('/elections', data),

updateStatus: (id, status) =>
api.patch(/elections/${id}/status, {
status,
}),
};

// ============================================================
// PARTIES API
// ============================================================

export const partiesApi = {
list: () =>
api.get('/parties').then(response => response.data),

create: (data) =>
api.post('/parties', data).then(response => response.data),

getOne: (id) =>
api.get(/parties/${id}).then(response => response.data),
};

// ============================================================
// USERS API
// ============================================================

export const usersApi = {
register: (payload) => {
if (!payload || typeof payload !== 'object') {
return Promise.reject(
new Error('Invalid user registration payload')
);
}

const normalizedPayload = {  
  ...payload,  
  email: payload.email?.trim().toLowerCase(),  
  firstName: payload.firstName?.trim(),  
  lastName: payload.lastName?.trim(),  

  scope: {  
    ...(payload.scope || {}),  
  },  
};  

// Do not silently remove party or state.  
console.log('API REGISTRATION REQUEST:', {  
  ...normalizedPayload,  
  password: '[HIDDEN]',  
});  

return api.post(  
  '/auth/register',  
  normalizedPayload  
).catch((error) => {  
  console.error(  
    'API REGISTRATION RESPONSE ERROR:',  
    error.response?.data || error.message  
  );  

  throw error;  
});

},

list: () =>
api.get('/users'),
};

// ============================================================
// CANDIDATES API
// ============================================================

export const candidatesApi = {
list: (electionId) =>
api.get('/candidates', {
params: {
election: electionId,
},
}),

create: (data) =>
api.post('/candidates', data),
};

// ============================================================
// GEOGRAPHICAL API
// ============================================================

export const geoApi = {
states: () =>
api.get('/geo/states').then(
response => response.data.states
),

lgas: (stateCode) =>
api.get(/geo/states/${stateCode}/lgas).then(
response => response.data.lgas
),

wards: (lgaCode) =>
api.get(/geo/lgas/${lgaCode}/wards).then(
response => response.data.wards
),

pollingUnits: (wardCode) =>
api.get(/geo/wards/${wardCode}/polling-units).then(
response => response.data.pollingUnits
),
};

// ============================================================
// REPORTS API
// ============================================================

export const reportsApi = {
resultsCsvUrl: (electionId) =>
${BASE_URL}/reports/${electionId}/results.csv,

collationCsvUrl: (electionId) =>
${BASE_URL}/reports/${electionId}/collation.csv,

download: async (url, filename) => {
const token = tokens.access;

const response = await fetch(url, {  
  headers: token  
    ? { Authorization: `Bearer ${token}` }  
    : {},  
});  

if (!response.ok) {  
  const error = await response.json().catch(  
    () => ({ error: 'Download failed' })  
  );  

  throw new Error(  
    error.message ||  
    error.error ||  
    'Download failed'  
  );  
}  

const blob = await response.blob();  

const downloadUrl =  
  window.URL.createObjectURL(blob);  

const link = document.createElement('a');  

link.href = downloadUrl;  
link.download = filename;  

document.body.appendChild(link);  
link.click();  
document.body.removeChild(link);  

window.URL.revokeObjectURL(downloadUrl);

},
};
