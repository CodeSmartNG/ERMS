const express = require('express');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Downloading full CSV and seeding started! Watch Render logs. This will take 3-5 minutes.' });

  const dataDir = path.join(__dirname, '../../data');
  const csvPath = path.join(dataDir, 'nigeria_polling_units.csv');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const file = fs.createWriteStream(csvPath);
  
  https.get('https://raw.githubusercontent.com/Emeka-Onwuepe/Polling_Units_in_Nigeria/main/Nigeria_polling_units.csv', (response) => {
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log('✅ CSV Downloaded successfully. Starting full seed script...');
      
      // NO --limit flag here. It will run all 176,846 rows.
      const seedProcess = spawn('node', ['scripts/seedGeo.js']);

      seedProcess.stdout.on('data', (data) => {
        console.log(`[Seed]: ${data.toString().trim()}`);
      });

      seedProcess.stderr.on('data', (data) => {
        console.error(`[Seed Error]: ${data.toString().trim()}`);
      });

      seedProcess.on('close', (code) => {
        console.log(`✅ Full seed process exited with code ${code}`);
      });
    });
  }).on('error', (err) => {
    console.error('❌ Download failed:', err.message);
  });
});

module.exports = router;
