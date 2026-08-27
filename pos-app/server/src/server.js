const path = require('path');
const { getDb } = require('./db/db');
const { createApp } = require('./app');
const { runBackup } = require('./services/backupService');
const { runVoucherChecks } = require('./services/voucherIssuance');

const db = getDb();
const app = createApp(db);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/golvia.db');
const backupDir = path.join(__dirname, '../data/backups');

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
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 4173;
app.listen(PORT, '127.0.0.1', () => console.log(`GOLVIA POS server running on http://localhost:${PORT}`));
