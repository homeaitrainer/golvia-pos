const path = require('path');
const { getDb } = require('./db/db');
const { createApp } = require('./app');
const { runBackup } = require('./services/backupService');

const db = getDb();
const app = createApp(db);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/golvia.db');
const backupDir = path.join(__dirname, '../data/backups');

function scheduleDailyBackup() {
  runBackup(dbPath, backupDir); // run once at startup
  setInterval(() => runBackup(dbPath, backupDir), 24 * 60 * 60 * 1000);
}
scheduleDailyBackup();

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => console.log(`GOLVIA POS server running on http://localhost:${PORT}`));
