#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

const ZONE_BY_STATE = {
  Adamawa: 'NE', Bauchi: 'NE', Jigawa: 'NW', Kaduna: 'NW', Kano: 'NW',
  Katsina: 'NW', Kebbi: 'NW', Sokoto: 'NW', Yobe: 'NE', Zamfara: 'NW',
};

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Forces "adamawa", "ADAMAWA", "Adamawa " into "Adamawa"
function formatStateName(name) {
  if (!name) return '';
  const lower = name.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

async function* readCsvRows(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    if (!headers) {
      headers = cells.map((h) => h.trim().toLowerCase());
      continue;
    }
    yield Object.fromEntries(headers.map((h, idx) => [h, (cells[idx] || '').trim()]));
  }
}

async function main() {
  // ADD THIS LINE: Force delete the old partial CSV so it redownloads
  if (fs.existsSync(CSV_PATH)) {
    fs.unlinkSync(CSV_PATH);
    console.log('🗑️ Deleted old CSV cache.');
  }

  await mongoose.connect(env.MONGODB_URI);
  
  console.log(`✅ MongoDB connected`);
  
  console.log('🧹 Clearing old geo data...');
  await models.PollingUnit.deleteMany({});
  await models.Ward.deleteMany({});
  await models.LGA.deleteMany({});
  await models.State.deleteMany({});
  console.log('✅ Old data cleared.\n');

  const stateCache = new Map(); 
  const lgaCache = new Map(); 
  const wardCache = new Map(); 
  let stats = { states: 0, lgas: 0, wards: 0, pus: 0, skipped: 0 };

  try {
    for await (const row of readCsvRows(CSV_PATH)) {
      const rawStateName = row.state?.trim();
      const lgaName = row.lg?.trim();
      const wardName = row.ward?.trim();
      const puName = row.location || row.pu_name || `PU ${row.pu_code || row.code}`;
      const puCode = row.code || row.pu_code;

      if (!rawStateName || !lgaName || !wardName || !puCode) {
        stats.skipped++;
        continue;
      }

      // Force title case (e.g. "adamawa" -> "Adamawa")
      const stateName = formatStateName(rawStateName);

      // Check if state is in our allowed list
      if (!ALLOWED_STATES.includes(stateName.toLowerCase())) {
        stats.skipped++;
        continue;
      }

      const stateCode = STATE_CODES[stateName] || stateName.slice(0, 2).toUpperCase();

      // ---- State ----
      let state = stateCache.get(stateName);
      if (!state) {
        // Use try/catch so if it hits a duplicate, it continues instead of crashing
        try {
          state = await models.State.findOneAndUpdate(
            { code: stateCode },
            { $setOnInsert: { 
                code: stateCode, 
                name: stateName, 
                slug: slugify(stateName), 
                zone: ZONE_BY_STATE[stateName] || 'NC', 
                isActive: true 
              } 
            },
            { upsert: true, new: true, lean: true }
          );
          stateCache.set(stateName, state);
          stats.states++;
          console.log(`[Seed]: Created State ${stateName} (${stateCode})`);
        } catch (err) {
          // If it fails, skip this row entirely
          stats.skipped++;
          continue;
        }
      }

      // ---- LGA ----
      const lgaCode = `${stateCode}-${slugify(lgaName)}`;
      let lga = lgaCache.get(lgaCode);
      if (!lga) {
        lga = await models.LGA.findOneAndUpdate(
          { code: lgaCode },
          { $setOnInsert: { code: lgaCode, name: lgaName, state: state._id, stateCode, isActive: true } },
          { upsert: true, new: true, lean: true }
        );
        lgaCache.set(lgaCode, lga);
        stats.lgas++;
      }

      // ---- Ward ----
      const wardCode = `${lgaCode}-${slugify(wardName)}`;
      let ward = wardCache.get(wardCode);
      if (!ward) {
        ward = await models.Ward.findOneAndUpdate(
          { code: wardCode },
          { $setOnInsert: { code: wardCode, name: wardName, lga: lga._id, state: state._id, lgaCode, stateCode, isActive: true } },
          { upsert: true, new: true, lean: true }
        );
        wardCache.set(wardCode, ward);
        stats.wards++;
      }

      // ---- PollingUnit ----
      const puPath = [stateCode, lgaCode, wardCode, puCode];
      await models.PollingUnit.updateOne(
        { code: puCode },
        { $setOnInsert: { 
            code: puCode, name: puName, ward: ward._id, lga: lga._id, state: state._id, 
            wardCode, lgaCode, stateCode, path: puPath, 
            ancestors: { state: state._id, lga: lga._id, ward: ward._id }, 
            address: row.location || null, registeredVoters: 0, isActive: true 
        } },
        { upsert: true }
      );
      stats.pus++;
    }
  } catch (err) {
    console.error('❌ FATAL ERROR DURING SEED:', err.message);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   States saved  : ${stats.states}`);
  console.log(`   LGAs saved    : ${stats.lgas}`);
  console.log(`   Wards saved   : ${stats.wards}`);
  console.log(`   PUs saved     : ${stats.pus}`);
  console.log(`   Rows skipped  : ${stats.skipped}`);
  console.log('\n✅ Done.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
