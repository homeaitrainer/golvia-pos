const path = require('path');
const { getDb } = require('./db/db');
const { createApp } = require('./app');
const { runBackup } = require('./services/backupService');
const { runVoucherChecks } = require('./services/voucherIssuance');

const db = getDb();
const app = createApp(db);

// DATA_DIR lets a host mount a persistent volume somewhere other than the repo (managed platforms
// wipe the app directory on every deploy, so the database has to live on a mounted disk or it is
// lost). Locally it is unset and everything stays under server/data as before.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');
const dbPath = process.env.DB_PATH || path.join(dataDir, 'golvia.db');
const backupDir = path.join(dataDir, 'backups');

function scheduleDailyBackup() {
  runBackup(dbPath, backupDir); // run once at startup
  setInterval(() => runBackup(dbPath, backupDir), 24 * 60 * 60 * 1000);
}
scheduleDailyBackup();

// Hourly (not daily) so a shop open past midnight, or a server restarted mid-day, still catches
// newly-eligible customers reasonably promptly. The idempotency checks in runVoucherChecks make
// repeated runs safe/cheap.
function scheduleVoucherChecks() {
  runVoucherChecks(db, new Date()); // run once at startup
  setInterval(() => runVoucherChecks(db, new Date()), 60 * 60 * 1000);
}
scheduleVoucherChecks();

const clientDist = path.join(__dirname, '../../client/dist');
if (require('fs').existsSync(clientDist)) {
  app.use(require('express').static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile('index.html', { root: clientDist });
  });
}

// Binding is deliberately localhost-only by default: the shop install must not be reachable from
// other devices on the shop's wifi. A host platform needs 0.0.0.0 to route traffic in, so that is
// opt-in via the same GOLVIA_PUBLIC switch that turns on secure cookies -- the two must move
// together, and one flag makes that impossible to get half-right.
const isPublicDeployment = process.env.GOLVIA_PUBLIC === '1';
const HOST = process.env.HOST || (isPublicDeployment ? '0.0.0.0' : '127.0.0.1');
const PORT = process.env.PORT || 4173;

if (isPublicDeployment) {
  // Refuse to expose the shop's customer database to the internet while the setup password is
  // still in place. This is a hard stop rather than a warning: a warning in a deploy log is not
  // read, and the cost of getting it wrong is every customer's name, phone, and purchase history
  // sitting behind a password that is written down in this repository's README.
  const { verifyLogin } = require('./services/authService');
  if (verifyLogin(db, 'admin', 'changeme123')) {
    console.error('REFUSING TO START: GOLVIA_PUBLIC=1 but the admin account still uses the default');
    console.error('setup password. Set a real one first:');
    console.error('  node src/services/setAdminPassword.js <username> <password>');
    process.exit(1);
  }

  // Required for secure cookies to work behind a hosting platform's HTTPS proxy: without it
  // Express sees the internal http hop and silently declines to set the cookie.
  app.set('trust proxy', 1);
}

app.listen(PORT, HOST, () => {
  const where = isPublicDeployment ? `${HOST}:${PORT} (public deployment)` : `http://localhost:${PORT}`;
  console.log(`GOLVIA POS server running on ${where}`);
});
