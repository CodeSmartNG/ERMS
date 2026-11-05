class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
  static badRequest(m = 'Bad request', d) { return new ApiError(400, m, d); }
  static unauthorized(m = 'Unauthorized') { return new ApiError(401, m); }
  static forbidden(m = 'Forbidden')      { return new ApiError(403, m); }
  static notFound(m = 'Not found')       { return new ApiError(404, m); }
  static conflict(m = 'Conflict')        { return new ApiError(409, m); }
  static tooMany(m = 'Too many requests'){ return new ApiError(429, m); }
  static internal(m = 'Internal server error') { return new ApiError(500, m); }
}

module.exports = ApiError;
