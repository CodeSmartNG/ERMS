 const express = require('express');
 const authRoutes = require('./authRoutes');
+const resultRoutes = require('./resultRoutes');

 const router = express.Router();

 router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
 router.use('/auth', authRoutes);
+router.use('/results', resultRoutes);

 module.exports = router;
