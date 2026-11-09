#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const models = require('../src/models');

const CSV_PATH = path.resolve(__dirname, '../data/nigeria_polling_units.csv');

const ALLOWED_STATES = [
  'katsina', 'kano', 'sokoto', 'zamfara', 'adamawa', 
  'bauchi', 'kaduna', 'jigawa', 'kebbi', 'yobe'
];

const STATE_CODES = {
  'Adamawa': 'AD', 'Bauchi': 'BA', 'Jigawa': 'JI', 'Kaduna': 'KD', 'Kano': 'KN',
  'Katsina': 'KT', 'Kebbi': 'KE', 'Sokoto': 'SO', 'Yobe': 'YO', 'Zamfara': 'ZA'
};

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatStateName(name) {
  if (!name) return '';
  const clean = name.replace(/["\r\n]/g, '').trim();
  const lower = clean.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`✅ MongoDB connected`);
  
  console.log('🧹 Clearing old geo data...');
  await models.PollingUnit.deleteMany({});
  await models.Ward.deleteMany({});
  await models.LGA.deleteMany({});
  await models.State.deleteMany({});
  console.log('✅ Old data cleared.\n');

  console.log('📖 Reading CSV file into memory...');
  const fileContent = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = fileContent.split(/\r?\n/);
  
  console.log('⚙️ Processing rows...');
  
  const stateCache = new Map(); 
  const lgaCache = new Map();   
  const wardCache = new Map();  

  const statesToInsert = [];
  const lgasToInsert = [];
  const wardsToInsert = [];
  const pusToInsert = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const row = line.split(',').map(c => c.replace(/["\r\n]/g, '').trim());
    
    const rawStateName = row[1];
    const lgaName = row[2];
    const wardName = row[3];
    const puCode = row[8];
    const puName = row[9] || `PU ${puCode}`;

    if (!rawStateName || !lgaName || !wardName || !puCode) continue;

    const stateName = formatStateName(rawStateName);
    if (!ALLOWED_STATES.includes(stateName.toLowerCase())) continue;

    const stateCode = STATE_CODES[stateName] || stateName.slice(0, 2).toUpperCase();

    let stateId = stateCache.get(stateName);
    if (!stateId) {
      stateId = new mongoose.Types.ObjectId();
      stateCache.set(stateName, stateId);
      statesToInsert.push({
        _id: stateId, code: stateCode, name: stateName, slug: slugify(stateName), zone: 'NC', isActive: true
      });
    }

    const lgaCode = `${stateCode}-${slugify(lgaName)}`;
    let lgaId = lgaCache.get(lgaCode);
    if (!lgaId) {
      lgaId = new mongoose.Types.ObjectId();
      lgaCache.set(lgaCode, lgaId);
      lgasToInsert.push({
        _id: lgaId, code: lgaCode, name: lgaName, state: stateId, stateCode: stateCode, isActive: true
      });
    }

    const wardCode = `${lgaCode}-${slugify(wardName)}`;
    let wardId = wardCache.get(wardCode);
    if (!wardId) {
      wardId = new mongoose.Types.ObjectId();
      wardCache.set(wardCode, wardId);
      wardsToInsert.push({
        _id: wardId, code: wardCode, name: wardName, lga: lgaId, state: stateId, lgaCode, stateCode, isActive: true
      });
    }

    pusToInsert.push({
      code: puCode,
      name: puName,
      ward: wardId,
      lga: lgaId,
      state: stateId,
      wardCode,
      lgaCode,
      stateCode,
      path: [stateCode, lgaCode, wardCode, puCode],
      ancestors: { state: stateId, lga: lgaId, ward: wardId },
      address: puName,
      registeredVoters: 0,
      isActive: true
    });
  }

  console.log(`📦 Found ${statesToInsert.length} States, ${lgasToInsert.length} LGAs, ${wardsToInsert.length} Wards, ${pusToInsert.length} PUs.`);
  
  if (statesToInsert.length) await models.State.insertMany(statesToInsert);
  if (lgasToInsert.length) await models.LGA.insertMany(lgasToInsert);
  if (wardsToInsert.length) await models.Ward.insertMany(wardsToInsert);
  
  const chunkSize = 5000;
  for (let i = 0; i < pusToInsert.length; i += chunkSize) {
    await models.PollingUnit.insertMany(pusToInsert.slice(i, i + chunkSize));
  }

  console.log('\n✅ Done! All data saved in a fraction of a second.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});