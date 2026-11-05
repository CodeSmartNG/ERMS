const env = require('./config/env');
const connectDB = require('./config/database');
const app = require('./app');

(async () => {
  await connectDB();
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 ERMS API listening on :${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
