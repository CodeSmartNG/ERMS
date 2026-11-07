
#!/usr/bin/env node

/**
 * CodeSmartNG ERMS - Nigeria Geographic Data Seeder
 *
 * Seeds:
 *  - 37 States (36 states + FCT)
 *  - 774 LGAs
 *  - Approximately 8,787 Wards
 *  - Approximately 176,846 Polling Units
 *
 * Source:
 * https://github.com/Emeka-Onwuepe/Polling_Units_in_Nigeria
 *
 * Usage:
 * node scripts/seedGeo.js
 * node scripts/seedGeo.js --dry-run
 * node scripts/seedGeo.js --limit=1000
 *
 * IMPORTANT:
 * Run without --limit for the complete dataset.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

const env = require('../src/config/env');
const models = require('../src/models');

const CSV_PATH = path.resolve(
  __dirname,
  '../data/nigeria_polling_units.csv'
);

// =====================================================
// COMMAND LINE ARGUMENTS
// =====================================================

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg
      .replace(/^--/, '')
      .split('=');

    return [key, value ?? true];
  })
);

const DRY_RUN =
  args['dry-run'] === true ||
  args['dry-run'] === 'true';

const LIMIT = args.limit
  ? Number.parseInt(args.limit, 10)
  : Infinity;

if (
  LIMIT !== Infinity &&
  (!Number.isInteger(LIMIT) || LIMIT < 1)
) {
  console.error('Invalid --limit value.');
  process.exit(1);
}

// =====================================================
// GEOPOLITICAL ZONES
// =====================================================

const ZONE_BY_STATE = {
  Abia: 'SE',
  Adamawa: 'NE',
  'Akwa Ibom': 'SS',
  Anambra: 'SE',
  Bauchi: 'NE',
  Bayelsa: 'SS',
  Benue: 'NC',
  Borno: 'NE',
  'Cross River': 'SS',
  Delta: 'SS',
  Ebonyi: 'SE',
  Edo: 'SS',
  Ekiti: 'SW',
  Enugu: 'SE',
  FCT: 'FCT',
  Gombe: 'NE',
  Imo: 'SE',
  Jigawa: 'NW',
  Kaduna: 'NW',
  Kano: 'NW',
  Katsina: 'NW',
  Kebbi: 'NW',
  Kogi: 'NC',
  Kwara: 'NC',
  Lagos: 'SW',
  Nasarawa: 'NC',
  Niger: 'NC',
  Ogun: 'SW',
  Ondo: 'SW',
  Osun: 'SW',
  Oyo: 'SW',
  Plateau: 'NC',
  Rivers: 'SS',
  Sokoto: 'NW',
  Taraba: 'NE',
  Yobe: 'NE',
  Zamfara: 'NW',
};

// =====================================================
// HELPERS
// =====================================================

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stateCodeFromRow(state, csvCode) {
  const code = String(csvCode || '').trim().toUpperCase();

  if (code) return code;

  return String(state || '')
    .trim()
    .slice(0, 2)
    .toUpperCase();
}

function normalizeName(value) {
  return String(value || '').trim();
}

function getRequiredRowValue(row, key) {
  return normalizeName(row[key]);
}

// =====================================================
// CSV READER
// =====================================================

async function* readCsvRows(file) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  let headers = null;
  let rowNumber = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    // This dataset is expected to have no quoted commas
    // in the columns used by this script.
    const cells = line.split(',');

    if (!headers) {
      headers = cells.map((header) =>
        header.replace(/^\uFEFF/, '').trim()
      );

      const requiredHeaders = [
        'state',
        'lg',
        'ward',
        'code',
      ];

      const missing = requiredHeaders.filter(
        (header) => !headers.includes(header)
      );

      if (missing.length) {
        throw new Error(
          `CSV is missing required columns: ${missing.join(', ')}`
        );
      }

      continue;
    }

    const row = {};

    headers.forEach((header, index) => {
      row[header] = String(cells[index] || '').trim();
    });

    rowNumber++;

    yield {
      ...row,
      __rowNumber: rowNumber,
    };

    if (rowNumber >= LIMIT) break;
  }
}

// =====================================================
// MAIN SEED FUNCTION
// =====================================================

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(
      `CSV file not found: ${CSV_PATH}`
    );
  }

  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing from your environment.');
  }

  console.log('\n========================================');
  console.log(' CodeSmartNG ERMS - GEO DATA SEEDER');
  console.log('========================================\n');

  console.log(`CSV file: ${CSV_PATH}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'DATABASE WRITE'}`);
  console.log(
    `Limit: ${LIMIT === Infinity ? 'FULL DATASET' : LIMIT}`
  );

  await mongoose.connect(env.MONGODB_URI);

  console.log('\nMongoDB connected successfully.\n');

  // ---------------------------------------------------
  // CACHES
  // ---------------------------------------------------

  const stateCache = new Map();
  const lgaCache = new Map();
  const wardCache = new Map();

  // ---------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------

  const stats = {
    rows: 0,
    skipped: 0,
    states: new Set(),
    lgas: new Set(),
    wards: new Set(),
    pus: 0,
  };

  // ---------------------------------------------------
  // PROCESS CSV
  // ---------------------------------------------------

  for await (const row of readCsvRows(CSV_PATH)) {
    stats.rows++;

    const stateName = getRequiredRowValue(row, 'state');
    const lgaName = getRequiredRowValue(row, 'lg');
    const wardName = getRequiredRowValue(row, 'ward');

    const puName =
      getRequiredRowValue(row, 'Location') ||
      getRequiredRowValue(row, 'pu_name') ||
      `Polling Unit ${row.code}`;

    const puCode = getRequiredRowValue(row, 'code');

    const stateCode = stateCodeFromRow(
      stateName,
      row.state_code
    );

    // -------------------------------------------------
    // VALIDATE ROW
    // -------------------------------------------------

    if (
      !stateName ||
      !lgaName ||
      !wardName ||
      !puCode ||
      !stateCode
    ) {
      stats.skipped++;

      console.warn(
        `Skipped invalid CSV row ${row.__rowNumber}`
      );

      continue;
    }

    // -------------------------------------------------
    // STATE
    // -------------------------------------------------

    let state = stateCache.get(stateName);

    if (!state) {
      const stateData = {
        name: stateName,
        slug: slugify(stateName),
        zone: ZONE_BY_STATE[stateName] || 'NC',
        isActive: true,
      };

      if (!DRY_RUN) {
        state = await models.State.findOneAndUpdate(
          { code: stateCode },
          {
            $set: stateData,
            $setOnInsert: {
              code: stateCode,
            },
          },
          {
            upsert: true,
            new: true,
            lean: true,
            runValidators: true,
          }
        );

        if (!state) {
          throw new Error(
            `Could not create or update state: ${stateName}`
          );
        }
      } else {
        state = {
          _id: new mongoose.Types.ObjectId(),
          code: stateCode,
          name: stateName,
        };
      }

      stateCache.set(stateName, state);
      stats.states.add(stateName);
    }

    // -------------------------------------------------
    // LGA
    // -------------------------------------------------

    const lgaCode =
      `${stateCode}-${slugify(lgaName)}`;

    const lgaKey =
      `${stateCode}:${lgaName}`;

    let lga = lgaCache.get(lgaKey);

    if (!lga) {
      const lgaData = {
        name: lgaName,
        state: state._id,
        stateCode,
        isActive: true,
      };

      if (!DRY_RUN) {
        lga = await models.LGA.findOneAndUpdate(
          { code: lgaCode },
          {
            $set: lgaData,
            $setOnInsert: {
              code: lgaCode,
            },
          },
          {
            upsert: true,
            new: true,
            lean: true,
            runValidators: true,
          }
        );

        if (!lga) {
          throw new Error(
            `Could not create or update LGA: ${lgaName}`
          );
        }
      } else {
        lga = {
          _id: new mongoose.Types.ObjectId(),
          code: lgaCode,
        };
      }

      lgaCache.set(lgaKey, lga);
      stats.lgas.add(lgaCode);
    }

    // -------------------------------------------------
    // WARD
    // -------------------------------------------------

    const wardCode =
      `${lgaCode}-${slugify(wardName)}`;

    const wardKey =
      `${lgaCode}:${wardName}`;

    let ward = wardCache.get(wardKey);

    if (!ward) {
      const wardData = {
        name: wardName,
        lga: lga._id,
        state: state._id,
        lgaCode,
        stateCode,
        isActive: true,
      };

      if (!DRY_RUN) {
        ward = await models.Ward.findOneAndUpdate(
          { code: wardCode },
          {
            $set: wardData,
            $setOnInsert: {
              code: wardCode,
            },
          },
          {
            upsert: true,
            new: true,
            lean: true,
            runValidators: true,
          }
        );

        if (!ward) {
          throw new Error(
            `Could not create or update ward: ${wardName}`
          );
        }
      } else {
        ward = {
          _id: new mongoose.Types.ObjectId(),
          code: wardCode,
        };
      }

      wardCache.set(wardKey, ward);
      stats.wards.add(wardCode);
    }

    // -------------------------------------------------
    // POLLING UNIT
    // -------------------------------------------------

    if (!DRY_RUN) {
      const puPath = [
        stateCode,
        lgaCode,
        wardCode,
        puCode,
      ];

      const puData = {
        name: puName,
        ward: ward._id,
        lga: lga._id,
        state: state._id,

        wardCode,
        lgaCode,
        stateCode,

        path: puPath,

        ancestors: {
          state: state._id,
          lga: lga._id,
          ward: ward._id,
        },

        address: row.Location || null,
        isActive: true,
      };

      const result = await models.PollingUnit.updateOne(
        { code: puCode },
        {
          $set: puData,
          $setOnInsert: {
            code: puCode,
            registeredVoters: 0,
          },
        },
        {
          upsert: true,
          runValidators: true,
        }
      );

      if (!result.acknowledged) {
        throw new Error(
          `Failed to save polling unit: ${puCode}`
        );
      }
    }

    stats.pus++;

    // -------------------------------------------------
    // PROGRESS
    // -------------------------------------------------

    if (stats.rows % 10000 === 0) {
      console.log(
        `${stats.rows.toLocaleString()} rows processed | ` +
        `${stats.states.size} states | ` +
        `${stats.lgas.size} LGAs | ` +
        `${stats.wards.size} wards | ` +
        `${stats.pus.toLocaleString()} polling units`
      );
    }
  }

  // ===================================================
  // CSV SUMMARY
  // ===================================================

  console.log('\n========================================');
  console.log(' CSV PROCESSING SUMMARY');
  console.log('========================================');

  console.log(`Rows read: ${stats.rows.toLocaleString()}`);
  console.log(`States seen: ${stats.states.size}`);
  console.log(`LGAs seen: ${stats.lgas.size}`);
  console.log(`Wards seen: ${stats.wards.size}`);
  console.log(`Polling units seen: ${stats.pus.toLocaleString()}`);
  console.log(`Rows skipped: ${stats.skipped}`);

  console.log('\nStates found in CSV:');

  for (const name of [...stats.states].sort()) {
    console.log(` - ${name}`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN completed. No database records were changed.');
    return;
  }

  // ===================================================
  // VERIFY DATABASE COUNTS
  // ===================================================

  console.log('\n========================================');
  console.log(' DATABASE VERIFICATION');
  console.log('========================================');

  const [
    allStates,
    activeStates,
    inactiveStates,
    allLGAs,
    activeLGAs,
    allWards,
    activeWards,
    allPUs,
    activePUs,
  ] = await Promise.all([
    models.State.countDocuments(),
    models.State.countDocuments({ isActive: true }),
    models.State.countDocuments({ isActive: false }),

    models.LGA.countDocuments(),
    models.LGA.countDocuments({ isActive: true }),

    models.Ward.countDocuments(),
    models.Ward.countDocuments({ isActive: true }),

    models.PollingUnit.countDocuments(),
    models.PollingUnit.countDocuments({ isActive: true }),
  ]);

  console.log(`All states: ${allStates}`);
  console.log(`Active states: ${activeStates}`);
  console.log(`Inactive states: ${inactiveStates}`);

  console.log(`All LGAs: ${allLGAs}`);
  console.log(`Active LGAs: ${activeLGAs}`);

  console.log(`All wards: ${allWards}`);
  console.log(`Active wards: ${activeWards}`);

  console.log(`All polling units: ${allPUs}`);
  console.log(`Active polling units: ${activePUs}`);

  // ===================================================
  // DISPLAY STATES IN DATABASE
  // ===================================================

  const savedStates = await models.State.find()
    .select('name code isActive zone')
    .sort({ name: 1 })
    .lean();

  console.log('\nStates currently stored in MongoDB:');

  for (const state of savedStates) {
    console.log(
      `${state.isActive ? '[ACTIVE]' : '[INACTIVE]'} ` +
      `${state.name} (${state.code})`
    );
  }

  // ===================================================
  // FINAL CHECKS
  // ===================================================

  console.log('\n========================================');
  console.log(' FINAL CHECK');
  console.log('========================================');

  if (activeStates === 37) {
    console.log('SUCCESS: All 37 states/FCT are active.');
  } else {
    console.warn(
      `WARNING: Expected 37 active states, found ${activeStates}.`
    );
  }

  if (activeLGAs !== 774) {
    console.warn(
      `WARNING: Expected 774 active LGAs, found ${activeLGAs}.`
    );
  }

  if (stats.states.size < 37) {
    console.warn(
      'The CSV did not contain all 37 states/FCT. ' +
      'Check the source CSV file and its contents.'
    );
  }

  console.log('\nGeo seeding finished.');
}

// =====================================================
// START AND CLEANUP
// =====================================================

main()
  .catch((error) => {
    console.error('\nGEO SEED FAILED:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
