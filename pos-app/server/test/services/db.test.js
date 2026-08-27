const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
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
