 const express = require('express');
 const authRoutes = require('./authRoutes');
 const resultRoutes = require('./resultRoutes');
const incidentRoutes = require('./incidentRoutes');
const collationRoutes = require('./collationRoutes');

 const router = express.Router();

 router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
 router.use('/auth', authRoutes);
 router.use('/results', resultRoutes);
router.use('/incidents', incidentRoutes);
router.use('/collation', collationRoutes);

 module.exports = router;
