const rateLimit = require('express-rate-limit');

const common = { standardHeaders: true, legacyHeaders: false };

const globalLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please slow down' },
});

const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `${req.ip}:${(req.body?.email || '').toLowerCase()}`,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const refreshLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many refresh attempts' },
});

const registerLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  message: { error: 'Too many account creations. Try again later.' },
});

module.exports = { globalLimiter, loginLimiter, refreshLimiter, registerLimiter };
