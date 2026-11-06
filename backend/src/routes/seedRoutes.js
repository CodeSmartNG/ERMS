const express = require('express');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
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
  https.get('https://raw.githubusercontent.com/Emeka-Onwuepe/Polling_Units_in_Nigeria/main/Nigeria_polling_units.csv', (response) => {
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log('✅ CSV Downloaded successfully. Starting seed script...');
      
      // Execute the seed script
      exec('node scripts/seedGeo.js', (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Seed error: ${error.message}`);
          return;
        }
        if (stderr) console.error(`⚠️ Seed stderr: ${stderr}`);
        console.log(`✅ Seed complete:\n${stdout}`);
      });
    });
  }).on('error', (err) => {
    console.error('❌ Download failed:', err.message);
  });
});

module.exports = router;
