#!/usr/bin/env node
/**
 * Seeds the geo tree from Nigeria_polling_units.csv.
 *
 * Source: https://github.com/Emeka-Onwuepe/Polling_Units_in_Nigeria
 *   176,846 PUs | 8,787 wards | 774 LGAs | 37 states+FCT
 *
 * Idempotent — re-runs upsert by stable `code`.
 * Derives path = [stateCode, lgaCode, wardCode, puCode] for every level.
 *
 * Usage:
 *   node scripts/seedGeo.js                     # full seed
 *   node scripts/seedGeo.js --dry-run           # validate only, no writes
 *   node scripts/seedGeo.js --limit=1000        # seed first N rows (smoke test)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const models = require('../src/models');

const CSV_PATH = path.resolve(__dirname, '../data/nigeria_polling_units.csv');

// ---- args ----
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';
const LIMIT = args.limit ? parseInt(args.limit, 10) : Infinity;

// ---- zone lookup (INEC geopolitical zones) ----
const ZONE_BY_STATE = {
  Abia: 'SE', Adamawa: 'NE', 'Akwa Ibom': 'SS', Anambra: 'SE', Bauchi: 'NE',
  Bayelsa: 'SS', Benue: 'NC', Borno: 'NE', 'Cross River': 'SS', Delta: 'SS',
  Ebonyi: 'SE', Edo: 'SS', Ekiti: 'SW', Enugu: 'SE', FCT: 'FCT',
  Gombe: 'NE', Imo: 'SE', Jigawa: 'NW', Kaduna: 'NW', Kano: 'NW',
  Katsina: 'NW', Kebbi: 'NW', Kogi: 'NC', Kwara: 'NC', Lagos: 'SW',
  Nasarawa: 'NC', Niger: 'NC', Ogun: 'SW', Ondo: 'SW', Osun: 'SW',
  Oyo: 'SW', Plateau: 'NC', Rivers: 'SS', Sokoto: 'NW', Taraba: 'NE',
  Yobe: 'NE', Zamfara: 'NW',
};

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stateCodeFromRow(state, csvCode) {
  // CSV state_code is the INEC 2-letter-ish code; fall back to slug if missing.
  return (csvCode || '').trim().toUpperCase() || state.slice(0, 2).toUpperCase();
}

async function* readCsvRows(file) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let headers = null;
  let i = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    // Naive CSV split (dataset has no quoted commas in the fields we use).
    const cells = line.split(',');
    if (!headers) {
      headers = cells.map((h) => h.trim());
      continue;
    }
    const row = Object.fromEntries(headers.map((h, idx) => [h, (cells[idx] || '').trim()]));
    yield row;
    if (++i >= LIMIT) break;
  }
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found at ${CSV_PATH}`);
    console.error('   Download it first (see README section 1).');
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI);
  console.log(`✅ MongoDB connected${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);
  console.log(`📄 Reading ${CSV_PATH}${LIMIT !== Infinity ? ` (limit ${LIMIT})` : ''}\n`);

  // In-memory caches to avoid redundant upserts within the same run.
  const stateCache = new Map();  // stateName -> { _id, code, slug }
  const lgaCache = new Map();    // `${stateCode}:${lgaName}` -> { _id, code }
  const wardCache = new Map();   // `${lgaCode}:${wardName}` -> { _id, code }

  let stats = { rows: 0, states: 0, lgas: 0, wards: 0, pus: 0, skipped: 0 };

  for await (const row of readCsvRows(CSV_PATH)) {
    stats.rows++;

    const stateName = row.state;
    const lgaName = row.lg;
    const wardName = row.ward;
    const puName = row.Location || row.pu_name || `PU ${row.pu_code}`;
    const puCode = row.code;
    const stateCode = stateCodeFromRow(stateName, row.state_code);

    if (!stateName || !lgaName || !wardName || !puCode) {
      stats.skipped++;
      continue;
    }

    // ---- State ----
    let state = stateCache.get(stateName);
    if (!state) {
      if (!DRY_RUN) {
        state = await models.State.findOneAndUpdate(
          { code: stateCode },
          {
            $setOnInsert: {
              code: stateCode,
              name: stateName,
              slug: slugify(stateName),
              zone: ZONE_BY_STATE[stateName] || 'NC',
              isActive: true,
            },
          },
          { upsert: true, new: true, lean: true }
        );
      } else {
        state = { _id: new mongoose.Types.ObjectId(), code: stateCode };
      }
      stateCache.set(stateName, state);
      stats.states++;
    }

    // ---- LGA ----
    // LGA codes in the CSV are NOT globally unique (44 unique values across 774 LGAs).
    // Build a stable compound code: ${stateCode}-${lgaSlug}
    const lgaCode = `${stateCode}-${slugify(lgaName)}`;
    const lgaKey = `${stateCode}:${lgaName}`;
    let lga = lgaCache.get(lgaKey);
    if (!lga) {
      if (!DRY_RUN) {
        lga = await models.LGA.findOneAndUpdate(
          { code: lgaCode },
          {
            $setOnInsert: {
              code: lgaCode,
              name: lgaName,
              state: state._id,
              stateCode,
              isActive: true,
            },
          },
          { upsert: true, new: true, lean: true }
        );
      } else {
        lga = { _id: new mongoose.Types.ObjectId(), code: lgaCode };
      }
      lgaCache.set(lgaKey, lga);
      stats.lgas++;
    }

    // ---- Ward ----
    const wardCode = `${lgaCode}-${slugify(wardName)}`;
    const wardKey = `${lgaCode}:${wardName}`;
    let ward = wardCache.get(wardKey);
    if (!ward) {
      if (!DRY_RUN) {
        ward = await models.Ward.findOneAndUpdate(
          { code: wardCode },
          {
            $setOnInsert: {
              code: wardCode,
              name: wardName,
              lga: lga._id,
              state: state._id,
              lgaCode,
              stateCode,
              isActive: true,
            },
          },
          { upsert: true, new: true, lean: true }
        );
      } else {
        ward = { _id: new mongoose.Types.ObjectId(), code: wardCode };
      }
      wardCache.set(wardKey, ward);
      stats.wards++;
    }

    // ---- PollingUnit ----
    if (!DRY_RUN) {
      const puPath = [stateCode, lgaCode, wardCode, puCode];
      await models.PollingUnit.updateOne(
        { code: puCode },
        {
          $setOnInsert: {
            code: puCode,
            name: puName,
            ward: ward._id,
            lga: lga._id,
            state: state._id,
            wardCode,
            lgaCode,
            stateCode,
            path: puPath,
            ancestors: { state: state._id, lga: lga._id, ward: ward._id },
            address: row.Location || null,
            registeredVoters: 0, // not in dataset; update via separate import if available
            isActive: true,
          },
        },
        { upsert: true }
      );
    }
    stats.pus++;

    if (stats.rows % 10000 === 0) {
      console.log(`  ...${stats.rows.toLocaleString()} rows | ${stats.lgas} LGAs | ${stats.wards} wards | ${stats.pus.toLocaleString()} PUs`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Rows read     : ${stats.rows.toLocaleString()}`);
  console.log(`   States seen   : ${stats.states}`);
  console.log(`   LGAs seen     : ${stats.lgas.toLocaleString()}`);
  console.log(`   Wards seen    : ${stats.wards.toLocaleString()}`);
  console.log(`   PUs seen      : ${stats.pus.toLocaleString()}`);
  console.log(`   Rows skipped  : ${stats.skipped}`);

  if (!DRY_RUN) {
    console.log('\n🔍 Verifying counts in DB...');
    const [stateCount, lgaCount, wardCount, puCount] = await Promise.all([
      models.State.countDocuments(),
      models.LGA.countDocuments(),
      models.Ward.countDocuments(),
      models.PollingUnit.countDocuments(),
    ]);
    console.log(`   State        : ${stateCount} (expected 37)`);
    console.log(`   LGA          : ${lgaCount} (expected 774)`);
    console.log(`   Ward         : ${wardCount} (expected ~8,787)`);
    console.log(`   PollingUnit  : ${puCount} (expected ~176,846)`);

    if (stateCount !== 37) console.warn('⚠️  State count mismatch — check zone mapping / CSV');
    if (lgaCount !== 774) console.warn('⚠️  LGA count mismatch — some LGAs may share names across states');
  }

  console.log('\n✅ Done.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
