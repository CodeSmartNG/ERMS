#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const models = require('../src/models');

const CSV_PATH = path.resolve(__dirname, '../data/nigeria_polling_units.csv');

// Lowercase the list to make comparison foolproof
const ALLOWED_STATES = [
  'katsina', 'kano', 'sokoto', 'zamfara', 'adamawa', 
  'bauchi', 'kaduna', 'jigawa', 'kebbi', 'yobe'
];

const ZONE_BY_STATE = {
  Adamawa: 'NE', Bauchi: 'NE', Jigawa: 'NW', Kaduna: 'NW', Kano: 'NW',
  Katsina: 'NW', Kebbi: 'NW', Sokoto: 'NW', Yobe: 'NE', Zamfara: 'NW',
};

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stateCodeFromRow(state, csvCode) {
  return (csvCode || '').trim().toUpperCase() || state.slice(0, 2).toUpperCase();
}

async function* readCsvRows(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    if (!headers) {
      headers = cells.map((h) => h.trim().toLowerCase()); // Force headers to lowercase
      continue;
    }
    yield Object.fromEntries(headers.map((h, idx) => [h, (cells[idx] || '').trim()]));
  }
}

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`✅ MongoDB connected`);
  
  // WIPE OLD DATA
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

  for await (const row of readCsvRows(CSV_PATH)) {
    // Access properties using lowercase headers just to be safe
    const stateName = row.state;
    const lgaName = row.lg;
    const wardName = row.ward;
    const puName = row.location || row.pu_name || `PU ${row.pu_code || row.code}`;
    const puCode = row.code || row.pu_code;

    if (!stateName || !lgaName || !wardName || !puCode) {
      stats.skipped++;
      continue;
    }

    // Check if state is in our allowed list (case-insensitive)
    if (!ALLOWED_STATES.includes(stateName.toLowerCase())) {
      stats.skipped++;
      continue;
    }

    const stateCode = stateCodeFromRow(stateName, row.state_code);

    // ---- State ----
    let state = stateCache.get(stateName);
    if (!state) {
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
      } catch (err) {
        console.error(`❌ Failed to save State: ${stateName} (Code: ${stateCode})`, err.message);
        continue;
      }
    }

    // ---- LGA ----
    const lgaCode = `${stateCode}-${slugify(lgaName)}`;
    let lga = lgaCache.get(lgaCode);
    if (!lga) {
      try {
        lga = await models.LGA.findOneAndUpdate(
          { code: lgaCode },
          { $setOnInsert: { code: lgaCode, name: lgaName, state: state._id, stateCode, isActive: true } },
          { upsert: true, new: true, lean: true }
        );
        lgaCache.set(lgaCode, lga);
        stats.lgas++;
      } catch (err) {
        console.error(`❌ Failed to save LGA: ${lgaName}`, err.message);
        continue;
      }
    }

    // ---- Ward ----
    const wardCode = `${lgaCode}-${slugify(wardName)}`;
    let ward = wardCache.get(wardCode);
    if (!ward) {
      try {
        ward = await models.Ward.findOneAndUpdate(
          { code: wardCode },
          { $setOnInsert: { code: wardCode, name: wardName, lga: lga._id, state: state._id, lgaCode, stateCode, isActive: true } },
          { upsert: true, new: true, lean: true }
        );
        wardCache.set(wardCode, ward);
        stats.wards++;
      } catch (err) {
        console.error(`❌ Failed to save Ward: ${wardName}`, err.message);
        continue;
      }
    }

    // ---- PollingUnit ----
    const puPath = [stateCode, lgaCode, wardCode, puCode];
    try {
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
    } catch (err) {
      // Ignore PU errors to keep going
    }
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
