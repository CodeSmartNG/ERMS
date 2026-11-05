const env = require('./config/env');
const connectDB = require('./config/database');
const app = require('./app');
const collationService = require('./services/collationService');

(async () => {
  await connectDB();
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 ERMS API listening on :${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down...`);
   
    setTimeout(() => process.exit(1), 10_000).unref();
     server.close();
     try {
      await collationService.flush();
      console.log('[shutdown] collation queue drained');
    } catch (err) {
      console.error('[shutdown] collation flush failed:', err.message);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
