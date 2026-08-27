const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { nextInvoiceNumber } = require('../../src/services/invoiceNumbering');

function freshDb() {
  const tmp = path.join(__dirname, `tmp-invnum-${Date.now()}-${Math.random()}.sqlite`);
  return { db: initDb(tmp), tmp };
}

test('first invoice of the year', () => {
  const { db, tmp } = freshDb();
  const num = nextInvoiceNumber(db, new Date('2026-03-01'));
  assert.equal(num, 'INV-2026-0001');
  db.close(); fs.unlinkSync(tmp);
});

test('increments sequentially within the same year', () => {
  const { db, tmp } = freshDb();
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method) VALUES (?, 0, 0, 'Cash')`).run('INV-2026-0001');
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method) VALUES (?, 0, 0, 'Cash')`).run('INV-2026-0002');
  const num = nextInvoiceNumber(db, new Date('2026-05-01'));
  assert.equal(num, 'INV-2026-0003');
  db.close(); fs.unlinkSync(tmp);
});

test('resets to 0001 in a new year', () => {
  const { db, tmp } = freshDb();
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method) VALUES (?, 0, 0, 'Cash')`).run('INV-2026-0050');
  const num = nextInvoiceNumber(db, new Date('2027-01-01'));
  assert.equal(num, 'INV-2027-0001');
  db.close(); fs.unlinkSync(tmp);
});
