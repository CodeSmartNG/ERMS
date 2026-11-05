#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const models = require('../src/models');
const app = require('../src/app');
const { signAccessToken } = require('../src/utils/tokens');

(async () => {
  await mongoose.connect(env.MONGODB_URI);

  // --- pick a real PU from seeded data ---
  const pu = await models.PollingUnit.findOne({ isActive: true }).lean();
  if (!pu) throw new Error('No polling units seeded — run scripts/seedGeo.js first');

  // --- election + parties + candidates ---
  const state = await models.State.findById(pu.ancestors.state).lean();
  let election = await models.Election.findOne({ type: 'PRESIDENTIAL' });
  if (!election) {
    const admin = await models.User.findOne({ role: 'NATIONAL_SUPER_ADMIN' });
    election = await models.Election.create({
      code: 'TEST-2026',
      title: 'Smoke Test Election',
      type: 'PRESIDENTIAL',
      electionDate: new Date(),
      status: 'ACTIVE',
      createdBy: admin._id,
    });
  } else {
    await models.Election.updateOne({ _id: election._id }, { $set: { status: 'ACTIVE' } });
  }

  const partyCodes = ['APC', 'PDP', 'LP'];
  const parties = [];
  for (const code of partyCodes) {
    let p = await models.Party.findOne({ code });
    if (!p) p = await models.Party.create({ code, name: `${code} Party`, abbreviation: code });
    parties.push(p);
    const exists = await models.Candidate.findOne({ election: election._id, party: p._id });
    if (!exists) {
      await models.Candidate.create({
        election: election._id,
        party: p._id,
        firstName: 'Test', lastName: code,
      });
    }
  }

  // --- agent user for the PU ---
  const agentEmail = `agent-${Date.now()}@test.local`;
  const agent = await models.User.create({
    email: agentEmail,
    password: 'TempPass!2026',
    firstName: 'Smoke',
    lastName: 'Agent',
    role: 'POLLING_UNIT_AGENT',
    scope: {
      state: pu.ancestors.state,
      lga: pu.ancestors.lga,
      ward: pu.ancestors.ward,
      pollingUnit: pu._id,
    },
  });
  const agentToken = signAccessToken(agent);

  // --- tiny test image ---
  const imgPath = path.join(__dirname, 'fixture.png');
  if (!fs.existsSync(imgPath)) {
    // 1x1 red PNG (base64) — valid image for sharp
    fs.writeFileSync(
      imgPath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      )
    );
  }

  // --- spawn server on ephemeral port ---
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  const idempotencyKey = crypto.randomUUID();
  const form = new FormData();
  form.append('election', election._id.toString());
  form.append('pollingUnit', pu._id.toString());
  form.append('registeredVoters', '1000');
  form.append('accreditedVoters', '400');
  form.append('totalVotesCast', '380');
  form.append('rejectedBallots', '5');
  form.append('totalValidVotes', '375'); // computed by server, but harmless
  form.append('partyVotes', JSON.stringify(parties.map((p, i) => ({
    party: p._id.toString(),
    votes: [150, 130, 95][i],
  }))));
  form.append('idempotencyKey', idempotencyKey);
  form.append('evidence', new Blob([fs.readFileSync(imgPath)], { type: 'image/png' }), 'evidence.png');

  const submitRes = await fetch(`${base}/results`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: form,
  });
  const submitJson = await submitRes.json();
  console.log('\n📤 Submit:', submitRes.status);
  console.log(JSON.stringify(submitJson.result ? {
    _id: submitJson.result._id,
    version: submitJson.result.version,
    status: submitJson.result.status,
    hash: submitJson.result.hash.slice(0, 16) + '…',
    evidenceHash: submitJson.result.evidence.photoHash.slice(0, 16) + '…',
    partyVotes: submitJson.result.partyVotes.map((p) => `${p.partyCode}=${p.votes}`),
  } : submitJson, null, 2));

  // --- idempotent replay ---
  const replay = await fetch(`${base}/results`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: form, // same key
  });
  const replayJson = await replay.json();
  console.log('\n🔁 Replay:', replay.status, 'idempotentReplay =', replayJson.idempotentReplay);

  // --- verify as super admin ---
  const superAdmin = await models.User.findOne({ role: 'NATIONAL_SUPER_ADMIN' });
  const adminToken = signAccessToken(superAdmin);
  const verifyRes = await fetch(`${base}/results/${submitJson.result._id}/verify`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'OK from smoke test' }),
  });
  const verifyJson = await verifyRes.json();
  console.log('\n✅ Verify:', verifyRes.status, 'status =', verifyJson.result?.status);

  server.close();
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
