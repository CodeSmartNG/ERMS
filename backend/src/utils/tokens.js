const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, typ: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), typ: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
  );
}

function verifyAccessToken(token) {
  const p = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (p.typ !== 'access') throw new Error('Not an access token');
  return p;
}

function verifyRefreshToken(token) {
  const p = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (p.typ !== 'refresh') throw new Error('Not a refresh token');
  return p;
}

// Refresh tokens are stored hashed (SHA-256). DB leak ≠ usable token.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};
