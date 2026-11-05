#!/usr/bin/env node
/* Bootstrap the first NATIONAL_SUPER_ADMIN. Safe to rerun. */
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const { ROLES } = require('../src/utils/roleScope');
const { hashToken } = require('../src/utils/tokens');

(async () => {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
    console.error('❌ Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env first.');
    process.exit(1);
  }
  if (env.SUPER_ADMIN_PASSWORD.length < 12) {
    console.error('❌ SUPER_ADMIN_PASSWORD must be ≥ 12 characters.');
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const email = env.SUPER_ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role === ROLES.NATIONAL_SUPER_ADMIN) {
      console.log(`ℹ️  Super admin already exists: ${email}`);
    } else {
      console.warn(`⚠️  User ${email} exists with role ${existing.role} — NOT overwriting.`);
    }
    return mongoose.disconnect();
  }

  const user = await User.create({
    email,
    password: env.SUPER_ADMIN_PASSWORD,
    firstName: process.env.SUPER_ADMIN_FIRST_NAME || 'System',
    lastName:  process.env.SUPER_ADMIN_LAST_NAME  || 'Administrator',
    role: ROLES.NATIONAL_SUPER_ADMIN,
    scope: {},
    isActive: true,
  });

  console.log(`🎉 Super admin created: ${user.email} (${user._id})`);
  console.log('⚠️  Rotate SUPER_ADMIN_PASSWORD env var now and log in to change it.');
  await mongoose.disconnect();
})().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
