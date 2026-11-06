const express = require('express');
const { exec } = require('child_process');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Seeding started! Check Render logs to watch progress.' });
  
  // Run the download and seed script in the background
  exec('mkdir -p data && curl -L -o data/nigeria_polling_units.csv https://raw.githubusercontent.com/Emeka-Onwuepe/Polling_Units_in_Nigeria/main/Nigeria_polling_units.csv && node scripts/seedGeo.js', (error, stdout, stderr) => {
    if (error) console.error(`Seed error: ${error.message}`);
    if (stderr) console.error(`Seed stderr: ${stderr}`);
    console.log(`Seed finished: ${stdout}`);
  });
});

module.exports = router;
