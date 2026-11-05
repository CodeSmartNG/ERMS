#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const models = require('../src/models');
const app = require('../src/app');
const { signAccessToken } = require('../src/utils/tokens');

(async () => {
  await mongoose.connect(env.MONGODB_URI);

  // Use an existing agent — reuse from smokeResult.js, or create one
  let agent = await models.User.findOne({ role: 'POLLING_UNIT_AGENT', isActive: true });
  if (!agent) throw new Error('Run smokeResult.js first to seed an agent, or seedGeo + create one');
  const pu = await models.PollingUnit.findById(agent.scope.pollingUnit).lean();
  if (!pu) throw new Error('Agent PU not found');

  const agentToken = signAccessToken(agent);

  // Use a real ward admin for the notify path
  const wardAdmin = await models.User.findOne({
    role: 'WARD_ADMIN', 'scope.ward': pu.ancestors.ward, isActive: true,
  });

  const imgPath = path.join(__dirname, 'fixture.png');
  if (!fs.existsSync(imgPath)) {
    fs.writeFileSync(imgPath, Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    ));
  }
  const imgBlob = new Blob([fs.readFileSync(imgPath)], { type: 'image/png' });

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;

  const idempotencyKey = crypto.randomUUID();
  const form = new FormData();
  form.append('type', 'BALLOT_SNATCHING');
  form.append('severity', 'HIGH');
  form.append('title', 'Armed men snatched ballot box at 09:42');
  form.append('description', 'Two armed men entered and took the ballot box; voters fled.');
  form.append('pollingUnit', pu._id.toString());
  form.append('occurredAt', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  form.append('idempotencyKey', idempotencyKey);
  form.append('gps', JSON.stringify({ lat: 9.05, lng: 7.49, accuracyM: 12 }));
  form.append('photos', imgBlob, 'scene-1.png');
  form.append('photos', imgBlob, 'scene-2.png');

  const res = await fetch(`${base}/incidents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: form,
  });
  const json = await res.json();
  console.log('\n📤 Submit:', res.status);
  console.log(JSON.stringify(json.incident ? {
    _id: json.incident._id,
    status: json.incident.status,
    path: json.incident.path,
    photos: json.incident.evidence?.photos?.length,
    videos: json.incident.evidence?.videos?.length,
  } : json, null, 2));

  // --- idempotent replay ---
  const replay = await fetch(`${base}/incidents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${agentToken}` },
    body: form,
  });
  const replayJson = await replay.json();
  console.log('\n🔁 Replay:', replay.status, 'idempotentReplay =', replayJson.idempotentReplay);

  // --- verify notification reached a ward admin (if one exists) ---
  if (wardAdmin) {
    const notif = await models.Notification.findOne({
      recipient: wardAdmin._id, type: 'INCIDENT_REPORTED', refId: json.incident._id,
    }).lean();
    console.log('\n🔔 Ward admin notification:', notif ? '✅ created' : '❌ missing');
  } else {
    console.log('\n⚠️  No ward admin for this ward — skipping notification check');
  }

  // --- transition status as ward admin (if exists) ---
  if (wardAdmin) {
    const adminToken = signAccessToken(wardAdmin);
    const ackRes = await fetch(`${base}/incidents/${json.incident._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACKNOWLEDGED', notes: 'Received, dispatching observer' }),
    });
    console.log('\n✅ Acknowledge:', ackRes.status);

    const resolveRes = await fetch(`${base}/incidents/${json.incident._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED', notes: 'Police responded; incident logged.' }),
    });
    const resolved = await resolveRes.json();
    console.log('✅ Resolve:', resolveRes.status, 'status =', resolved.incident?.status);
  }

  server.close();
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
