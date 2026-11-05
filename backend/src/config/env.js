require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`Missing required env: ${name}`);
  return v;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGODB_URI: required('MONGODB_URI'),
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
};

// Fail fast on weak secrets in production
if (env.NODE_ENV === 'production') {
  if (env.JWT_ACCESS_SECRET.length < 32) throw new Error('JWT_ACCESS_SECRET must be ≥ 32 chars');
  if (env.JWT_REFRESH_SECRET.length < 32) throw new Error('JWT_REFRESH_SECRET must be ≥ 32 chars');
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) throw new Error('JWT secrets must differ');
}

module.exports = env;
