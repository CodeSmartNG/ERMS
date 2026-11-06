const express = require('express');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Downloading CSV and seeding started! Watch Render logs.' });

  const dataDir = path.join(__dirname, '../../data');
  const csvPath = path.join(dataDir, 'nigeria_polling_units.csv');

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const file = fs.createWriteStream(csvPath);
  
  // Download the CSV using built-in Node.js HTTPS
  https.get('https://raw.githubusercontent.com/EmekaOnwuepe/Polling_Units_in_Nigeria/main/Nigeria_polling_units.csv', (response) => {
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log('✅ CSV Downloaded successfully. Starting seed script...');
      
      // Use spawn instead of exec to stream logs in real-time
      // Notice there is NO --limit here, this will run the full 176k rows
      const seedProcess = spawn('node', ['scripts/seedGeo.js']);

      seedProcess.stdout.on('data', (data) => {
        console.log(`[Seed]: ${data.toString().trim()}`);
      });

      seedProcess.stderr.on('data', (data) => {
        console.error(`[Seed Error]: ${data.toString().trim()}`);
      });

      seedProcess.on('close', (code) => {
        console.log(`✅ Seed process exited with code ${code}`);
      });
    });
  }).on('error', (err) => {
    console.error('❌ Download failed:', err.message);
  });
});

module.exports = router;
