const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/tokens');

/**
 * Verifies Bearer token, re-loads the user from DB (so scope changes and
 * deactivations take effect immediately — NOT trusting stale JWT scope).
 * Attaches req.user.
 */
const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account inactive or deleted');

  // Invalidate tokens issued before a password change
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
    throw ApiError.unauthorized('Session expired, please log in again');
  }

  req.user = user;
  next();
});

/** Exact role match. Super admin is NOT implicitly allowed — be explicit. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(' | ')}`));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
