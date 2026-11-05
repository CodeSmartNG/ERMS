const mongoose = require('mongoose');

/**
 * Parses MONGODB_URI for diagnostics WITHOUT leaking credentials.
 * Returns { scheme, host, dbName, problem } where problem is null if OK.
 */
function diagnoseUri(raw) {
  if (raw === undefined) return { problem: 'MONGODB_URI is undefined' };
  if (raw === null) return { problem: 'MONGODB_URI is null' };
  if (typeof raw !== 'string') return { problem: `MONGODB_URI is not a string (got ${typeof raw})` };

  const uri = raw;

  if (uri.length === 0) return { problem: 'MONGODB_URI is empty' };

  // Detect quotes / whitespace wrapping the value
  const firstChar = uri[0];
  const lastChar = uri[uri.length - 1];
  if (firstChar === '"' || firstChar === "'") {
    return {
      problem: `MONGODB_URI starts with a quote (${firstChar}). Remove quotes from the value in Render.`,
    };
  }
  if (firstChar === ' ' || firstChar === '\t' || firstChar === '\n') {
    return { problem: 'MONGODB_URI starts with whitespace. Trim the value in Render.' };
  }
  if (lastChar === ' ' || lastChar === '\t' || lastChar === '\n') {
    return { problem: 'MONGODB_URI ends with whitespace. Trim the value in Render.' };
  }

  // Detect pasted "KEY=value" line
  if (/^[A-Z_]+=/.test(uri)) {
    const prefix = uri.split('=')[0];
    return {
      problem: `MONGODB_URI value begins with "${prefix}=" — paste only the URI, not the "KEY=value" line.`,
    };
  }

  // Detect placeholder
  if (/[<>]/.test(uri.slice(0, 100))) {
    return {
      problem: 'MONGODB_URI contains "<" or ">" — replace <db_username>, <db_password> placeholders with real values.',
    };
  }

  // Scheme check
  const schemeMatch = /^(mongodb(?:\+srv)?):\/\//.exec(uri);
  if (!schemeMatch) {
    const snippet = uri.slice(0, 20).replace(/[\r\n]/g, '');
    return {
      problem: `MONGODB_URI does not start with mongodb:// or mongodb+srv:// (starts with "${snippet}...")`,
    };
  }
  const scheme = schemeMatch[1];

  // Best-effort host/db extraction (never includes password)
  let host = '';
  let dbName = '';
  try {
    // Strip credentials for URL parsing safety
    const withoutCredentials = uri.replace(/:\/\/[^@/]+@/, '://');
    const u = new URL(withoutCredentials);
    host = u.host;
    dbName = u.pathname.replace(/^\//, '') || '(none)';
  } catch {
    // Non-fatal — diagnostics only
  }

  return { scheme, host, dbName, problem: null };
}

async function connectDB() {
  mongoose.set('strictQuery', true);

  // ---- Pre-flight diagnostics ----
  const diag = diagnoseUri(process.env.MONGODB_URI);
  if (diag.problem) {
    console.error('❌ MONGODB_URI configuration error:');
    console.error('   ', diag.problem);
    console.error('    Fix the environment variable in Render → Environment, then redeploy.');
    process.exit(1);
  }

  console.log(`🔌 Connecting to MongoDB (${diag.scheme}, host=${diag.host}, db=${diag.dbName})`);

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    // ---- Post-failure diagnostics — always actionable, never leak the URI ----
    console.error('❌ MongoDB connection failed:', err.message);

    if (err.name === 'MongooseServerSelectionError' || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(err.message)) {
      console.error('   Hint: URI syntax is valid but the cluster could not be reached.');
      console.error('   → MongoDB Atlas → Network Access → add 0.0.0.0/0 (or your server IP).');
      console.error('   → Confirm the hostname in the URI matches your Atlas cluster.');
    } else if (/bad auth|Authentication failed/i.test(err.message)) {
      console.error('   Hint: Username or password in MONGODB_URI is incorrect.');
      console.error('   → Check the database user in Atlas → Database Access.');
      console.error('   → If the password contains @ : / ? # % & = +, URL-encode it.');
    } else if (/querySrv|ECONNREFUSED.*_mongodb\._tcp/i.test(err.message)) {
      console.error('   Hint: DNS SRV lookup failed — cluster hostname is likely wrong or suspended.');
    }

    process.exit(1);
  }

  // ---- Post-connect event listeners ----
  mongoose.connection.on('disconnected', () =>
    console.warn('⚠️  MongoDB disconnected')
  );
  mongoose.connection.on('reconnected', () =>
    console.log('🔁 MongoDB reconnected')
  );
  mongoose.connection.on('error', (err) =>
    console.error('⚠️  MongoDB connection error:', err.message)
  );
}

module.exports = connectDB;
