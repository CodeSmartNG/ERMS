
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
