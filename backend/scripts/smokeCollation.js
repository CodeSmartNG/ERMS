#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const models = require('../src/models');
const collationService = require('../src/services/collationService');

(async () => {
  await mongoose.connect(env.MONGODB_URI);

  // Find an election with VERIFIED results
  const verified = await models.Result.findOne({ status: 'VERIFIED', isCurrent: true });
  if (!verified) throw new Error('No VERIFIED results — run smokeResult.js first');

  const electionId = verified.election;
  console.log(`\n📊 Election: ${electionId}`);
  console.log(`   Ward:  ${verified.ward}`);
  console.log(`   LGA:   ${verified.lga}`);
  console.log(`   State: ${verified.state}\n`);

  // ---- Full rebuild ----
  console.log('🔨 Running full rebuild...');
  const t0 = Date.now();
  await collationService.rebuildAllForElection(electionId, null);
  console.log(`✅ Done in ${Date.now() - t0}ms\n`);

  // ---- Inspect ----
  for (const level of ['WARD', 'LGA', 'STATE', 'NATIONAL']) {
    const docs = await models.Collation.find({ election: electionId, level, isCurrent: true }).lean();
    console.log(`${level.padEnd(9)} ${docs.length} current doc(s)`);
    for (const d of docs.slice(0, 3)) {
      const top = d.partyTotals[0];
      console.log(
        `   ${(d.entityCode || 'NATIONAL').padEnd(40)} ` +
        `${String(d.pollingUnitsVerified).padStart(3)}/${d.pollingUnitsTotal} PUs ` +
        `(${d.reportingPercentage}%) | ` +
        `top=${top ? `${top.partyCode}=${top.votes}` : '—'} | ` +
        `hash=${d.sourceHash.slice(0, 12)}…`
      );
    }
  }

  // ---- Verify sourceHash ----
  console.log('\n🔍 Verifying sourceHash integrity...');
  for (const level of ['WARD', 'LGA', 'STATE', 'NATIONAL']) {
    const docs = await models.Collation.find({ election: electionId, level, isCurrent: true }).lean();
    for (const d of docs) {
      const res = await collationService.verifyCollation(d._id);
      if (!res.ok) {
        console.log(`   ❌ ${level} ${d.entityCode || 'NATIONAL'} — hash mismatch`);
      }
    }
  }
  console.log('✅ sourceHash verification complete (silence = all OK)');

  // ---- Consistency: national top = sum of states top ----
  console.log('\n🧮 Cross-check national vs states...');
  const national = await models.Collation.findOne({
    election: electionId, level: 'NATIONAL', isCurrent: true,
  }).lean();
  const stateDocs = await models.Collation.find({
    election: electionId, level: 'STATE', isCurrent: true,
  }).lean();

  const stateSum = {};
  for (const s of stateDocs) {
    for (const p of s.partyTotals) {
      stateSum[p.partyCode] = (stateSum[p.partyCode] || 0) + p.votes;
    }
  }

  let ok = true;
  for (const p of national.partyTotals) {
    const fromStates = stateSum[p.partyCode] || 0;
    if (p.votes !== fromStates) {
      console.log(`   ❌ ${p.partyCode}: national=${p.votes} states=${fromStates}`);
      ok = false;
    }
  }
  if (ok) console.log('✅ National totals match sum of state totals');

  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
