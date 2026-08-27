const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// `CREATE TABLE IF NOT EXISTS` in schema.sql only creates tables that don't exist yet -- it does
// NOT add new columns to a table that already exists from before that column was introduced.
// This codebase has no formal migration framework, so each such column gets a small, targeted,
// idempotent check-and-ALTER step here rather than a generic migration system.
function migrateSchema(db) {
  const voucherColumns = db.prepare('PRAGMA table_info(vouchers)').all();
  const hasRedeemedInvoiceId = voucherColumns.some((col) => col.name === 'redeemed_invoice_id');
  if (!hasRedeemedInvoiceId) {
    db.exec('ALTER TABLE vouchers ADD COLUMN redeemed_invoice_id INTEGER REFERENCES invoices(id)');
  }
}

function initDb(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(filePath);
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateSchema(db);
  return db;
}

let singleton = null;
function getDb() {
  if (!singleton) {
    const filePath = process.env.DB_PATH || path.join(__dirname, '../../data/golvia.db');
    singleton = initDb(filePath);
  }
  return singleton;
}

module.exports = { initDb, getDb };
