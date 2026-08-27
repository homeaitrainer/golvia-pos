const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { initDb } = require('../../src/db/db');

test('initDb creates all expected tables', () => {
  const tmp = path.join(__dirname, 'tmp-db-test.sqlite');
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const db = initDb(tmp);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['products', 'product_variants', 'customers', 'membership_accounts', 'vouchers', 'invoices', 'invoice_items', 'refunds', 'refund_items', 'message_log', 'settings', 'admin_users']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  db.close();
  fs.unlinkSync(tmp);
});

test('initDb migrates a pre-existing vouchers table (created before redeemed_invoice_id existed) by adding the column without losing data', () => {
  const tmp = path.join(__dirname, 'tmp-db-migration-test.sqlite');
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  // Simulate a database created by a version of this app from BEFORE batch F, i.e. before
  // vouchers.redeemed_invoice_id was added. Only the tables relevant to this migration (and
  // their dependencies) are created here -- customers and invoices, since vouchers references
  // both -- to keep the fixture focused.
  const oldDb = new Database(tmp);
  oldDb.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL
    );
    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL
    );
    CREATE TABLE vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      type TEXT NOT NULL,
      value REAL NOT NULL,
      min_spend REAL NOT NULL DEFAULT 0,
      issued_at TEXT NOT NULL,
      expires_at TEXT,
      redeemed_at TEXT
    );
  `);
  oldDb.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  oldDb.prepare(`
    INSERT INTO vouchers (id, customer_id, type, value, min_spend, issued_at, expires_at, redeemed_at)
    VALUES (1, 1, 'monthly-tier', 5, 100, '2026-08-01T00:00:00', '2026-08-31T23:59:59', '2026-08-10T12:00:00.000Z')
  `).run();

  const columnsBefore = oldDb.prepare('PRAGMA table_info(vouchers)').all();
  assert.ok(!columnsBefore.some(c => c.name === 'redeemed_invoice_id'), 'fixture must start WITHOUT the column');
  oldDb.close();

  // Re-opening the same file path through initDb (as the app does on every startup) must add
  // the missing column in place, without dropping or altering the existing row.
  const migratedDb = initDb(tmp);

  const columnsAfter = migratedDb.prepare('PRAGMA table_info(vouchers)').all();
  assert.ok(columnsAfter.some(c => c.name === 'redeemed_invoice_id'), 'column should exist after migration');

  const voucher = migratedDb.prepare('SELECT * FROM vouchers WHERE id = 1').get();
  assert.equal(voucher.customer_id, 1);
  assert.equal(voucher.type, 'monthly-tier');
  assert.equal(voucher.value, 5);
  assert.equal(voucher.min_spend, 100);
  assert.equal(voucher.redeemed_at, '2026-08-10T12:00:00.000Z');
  assert.equal(voucher.redeemed_invoice_id, null); // new column, defaults to NULL on existing rows

  // The query refundService.js runs on every full refund must now succeed instead of throwing
  // "no such column: redeemed_invoice_id".
  assert.doesNotThrow(() => {
    migratedDb.prepare('SELECT id FROM vouchers WHERE redeemed_invoice_id = ?').get(999);
  });

  migratedDb.close();
  fs.unlinkSync(tmp);
});

test('initDb is idempotent: calling it twice on a fresh (already-migrated) database does not error', () => {
  const tmp = path.join(__dirname, 'tmp-db-idempotent-test.sqlite');
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  const db1 = initDb(tmp);
  const columnsAfterFirst = db1.prepare('PRAGMA table_info(vouchers)').all();
  assert.ok(columnsAfterFirst.some(c => c.name === 'redeemed_invoice_id'));
  db1.close();

  // A brand-new schema.sql-created table already has the column -- initDb must not try (and
  // fail) to add it a second time.
  assert.doesNotThrow(() => {
    const db2 = initDb(tmp);
    db2.close();
  });

  fs.unlinkSync(tmp);
});
