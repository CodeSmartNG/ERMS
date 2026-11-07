const express = require('express');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Downloading full CSV. Watch Render logs.' });

  const dataDir = path.join(__dirname, '../../data');
  const csvPath = path.join(dataDir, 'nigeria_polling_units.csv');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // FORCE DELETE the old partial CSV file
  if (fs.existsSync(csvPath)) {
    fs.unlinkSync(csvPath);
    console.log('🗑️ Deleted old partial CSV.');
  }

  const file = fs.createWriteStream(csvPath);
  
  https.get('https://raw.githubusercontent.com/Emeka-Onwuepe/Polling_Units_in_Nigeria/main/Nigeria_polling_units.csv', (response) => {
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log('✅ Full CSV Downloaded successfully. Starting seed...');
      
      const seedProcess = spawn('node', ['scripts/seedGeo.js']);

      seedProcess.stdout.on('data', (data) => console.log(`[Seed]: ${data.toString().trim()}`));
      seedProcess.stderr.on('data', (data) => console.error(`[Seed Error]: ${data.toString().trim()}`));
      seedProcess.on('close', (code) => console.log(`✅ Seed process exited with code ${code}`));
    });
  }).on('error', (err) => console.error('❌ Download failed:', err.message));
});

module.exports = router;
