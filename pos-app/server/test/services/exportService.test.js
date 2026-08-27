const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { exportAllToCsv } = require('../../src/services/exportService');

test('exports products, customers, invoices as CSV text', () => {
  const tmp = path.join(__dirname, `tmp-export-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name, category) VALUES (1, 'Ring', 'Rings')`).run();
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method) VALUES ('INV-2026-0001', 300, 300, 'Cash')`).run();

  const files = exportAllToCsv(db);
  assert.ok(files['products.csv'].includes('Ring'));
  assert.ok(files['customers.csv'].includes('Alice'));
  assert.ok(files['invoices.csv'].includes('INV-2026-0001'));

  db.close(); fs.unlinkSync(tmp);
});
