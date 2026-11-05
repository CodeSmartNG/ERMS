/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const models = require('../src/models');
const env = require('../src/config/env');

(async () => {
  await mongoose.connect(env.MONGODB_URI);
  console.log('✅ Connected\n');

  // Validate indexes sync (throws on conflicting index definitions)
  for (const [name, Model] of Object.entries(models)) {
    await Model.init();
    const idx = await Model.collection.indexes();
    console.log(`${name.padEnd(14)} ${String(idx.length).padStart(2)} indexes`);
  }

  // Sanity: attempt an invalid Result should throw
  try {
    await new models.Result({
      election: new mongoose.Types.ObjectId(),
      pollingUnit: new mongoose.Types.ObjectId(),
      state: new mongoose.Types.ObjectId(),
      lga: new mongoose.Types.ObjectId(),
      ward: new mongoose.Types.ObjectId(),
      stateCode: 'KN', lgaCode: 'KN-01', wardCode: 'KN-01-01', puCode: 'PU-001',
      path: ['KN', 'KN-01', 'KN-01-01', 'PU-001'],
      registeredVoters: 1000,
      accreditedVoters: 500,
      totalVotesCast: 480,
      rejectedBallots: 20,
      partyVotes: [{ party: new mongoose.Types.ObjectId(), partyCode: 'APC', votes: 200 }],
      totalValidVotes: 300, // ← mismatch with partyVotes sum (200)
      evidence: { photoUrl: 'x', photoPublicId: 'x', photoHash: 'x', capturedAt: new Date() },
      hash: 'x', idempotencyKey: 'test-1',
      submittedBy: new mongoose.Types.ObjectId(),
    }).validate();
    console.error('❌ Result validation did NOT throw — bug!');
  } catch (err) {
    console.log('✅ Result validation correctly rejected:', err.message);
  }

  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
