const express = require('express');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Downloading FULL CSV. Watch Render logs.' });

  const dataDir = path.join(__dirname, '../../data');
  const csvPath = path.join(dataDir, 'nigeria_polling_units.csv');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(csvPath)) {
    fs.unlinkSync(csvPath);
  }

  const file = fs.createWriteStream(csvPath);
  
  // ADDED CACHE BUSTER: ?t=timestamp
  const csvUrl = `https://raw.githubusercontent.com/Emeka-Onwuepe/Polling_Units_in_Nigeria/main/Nigeria_polling_units.csv?t=${Date.now()}`;

  https.get(csvUrl, (response) => {
    if (response.statusCode !== 200) {
      console.error(`Failed to download CSV. Status: ${response.statusCode}`);
      return;
    }

    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      
      // CHECK FILE SIZE
      const stats = fs.statSync(csvPath);
      console.log(`✅ CSV Downloaded. Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
      if (stats.size < 1000000) {
        console.error('❌ Error: File is too small. The download was truncated.');
        return;
      }

      console.log('🚀 Starting seed process...');
      const seedProcess = spawn('node', ['scripts/seedGeo.js']);

      seedProcess.stdout.on('data', (data) => console.log(`[Seed]: ${data.toString().trim()}`));
      seedProcess.stderr.on('data', (data) => console.error(`[Seed Error]: ${data.toString().trim()}`));
      seedProcess.on('close', (code) => console.log(`✅ Seed process exited with code ${code}`));
    });
  }).on('error', (err) => console.error('❌ Download failed:', err.message));
});

module.exports = router;
