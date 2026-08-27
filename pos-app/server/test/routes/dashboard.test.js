const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

// A fixed local "now" used across these tests, threaded into createApp() via its `now` override
// (see app.js / dashboard.js) -- this makes "today" deterministic regardless of the real
// wall-clock time the test suite happens to run at, and regardless of host timezone, instead of
// depending on real current time the way the route used to (via bare `new Date()` / SQLite's
// UTC-based date('now')).
const FIXED_NOW = new Date(2026, 7, 27, 14, 0, 0); // Aug 27, 2026, 14:00 local time

function setup() {
  const tmp = path.join(__dirname, `tmp-dash-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const app = createApp(db, { now: () => FIXED_NOW });
  return { db, tmp, app };
}

async function loginAgent(app) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  return agent;
}

test('dashboard summary reports low stock and today totals', async () => {
  const { db, tmp, app } = setup();
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity, low_stock_threshold) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 1, 3)`).run();
  db.prepare(`
    INSERT INTO invoices (invoice_number, subtotal, total, payment_method, created_at)
    VALUES ('INV-2026-0001', 300, 300, 'Cash', ?)
  `).run(FIXED_NOW.toISOString());

  const agent = await loginAgent(app);
  const res = await agent.get('/api/dashboard/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.todayTransactionCount, 1);
  assert.equal(res.body.todaySalesTotal, 300);
  assert.equal(res.body.lowStockVariants.length, 1);

  db.close(); fs.unlinkSync(tmp);
});

test('an invoice created just after local midnight is still counted as today, even though it is UTC-yesterday', async () => {
  // This is the exact scenario the UTC-vs-local fix targets: 2026-08-27T00:30 local (Malaysia,
  // UTC+8) is still 2026-08-26T16:30 UTC. SQLite's date('now')/strftime(..., 'now') are
  // UTC-based and would have wrongly excluded this invoice from "today" for the first 8 hours
  // of the local day.
  const tmp = path.join(__dirname, `tmp-dash-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const justAfterLocalMidnight = new Date(2026, 7, 27, 0, 30, 0); // 2026-08-27 00:30 local
  const app = createApp(db, { now: () => justAfterLocalMidnight });

  db.prepare(`
    INSERT INTO invoices (invoice_number, subtotal, total, payment_method, created_at)
    VALUES ('INV-2026-0001', 150, 150, 'Cash', ?)
  `).run(justAfterLocalMidnight.toISOString());

  const agent = await loginAgent(app);
  const res = await agent.get('/api/dashboard/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.todayTransactionCount, 1);
  assert.equal(res.body.todaySalesTotal, 150);

  db.close(); fs.unlinkSync(tmp);
});

test('a full refund against today\'s invoice, refunded today, nets today\'s sales total to zero', async () => {
  const { db, tmp, app } = setup();

  const result = db.prepare(`
    INSERT INTO invoices (invoice_number, subtotal, total, payment_method, created_at)
    VALUES ('INV-2026-0001', 300, 300, 'Cash', ?)
  `).run(FIXED_NOW.toISOString());
  const invoiceId = result.lastInsertRowid;

  db.prepare(`
    INSERT INTO refunds (invoice_id, refund_amount, coins_reversed, payment_method, created_at)
    VALUES (?, 300, 0, 'Cash', ?)
  `).run(invoiceId, FIXED_NOW.toISOString());

  const agent = await loginAgent(app);
  const res = await agent.get('/api/dashboard/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.todayTransactionCount, 1); // the invoice itself still counts as a transaction
  assert.equal(res.body.todaySalesTotal, 0); // 300 (invoice) - 300 (today's refund) = 0

  db.close(); fs.unlinkSync(tmp);
});

test('a refund issued on a later day against an older invoice reduces THAT LATER day\'s total, not the invoice\'s original day', async () => {
  const { db, tmp } = setup();
  const invoiceDay = new Date(2026, 7, 20, 10, 0, 0); // invoice created Aug 20
  const refundDay = FIXED_NOW; // refunded Aug 27 (a week later)

  const result = db.prepare(`
    INSERT INTO invoices (invoice_number, subtotal, total, payment_method, created_at)
    VALUES ('INV-2026-0001', 300, 300, 'Cash', ?)
  `).run(invoiceDay.toISOString());
  const invoiceId = result.lastInsertRowid;

  db.prepare(`
    INSERT INTO refunds (invoice_id, refund_amount, coins_reversed, payment_method, created_at)
    VALUES (?, 300, 0, 'Cash', ?)
  `).run(invoiceId, refundDay.toISOString());

  const app = createApp(db, { now: () => FIXED_NOW });
  const agent = await loginAgent(app);
  const res = await agent.get('/api/dashboard/summary');
  assert.equal(res.status, 200);
  // No invoices were created today, so today's sales total is just -300 from the refund.
  assert.equal(res.body.todayTransactionCount, 0);
  assert.equal(res.body.todaySalesTotal, -300);

  db.close(); fs.unlinkSync(tmp);
});

test('upcomingBirthdays includes a customer whose birthday matches today\'s local month/day regardless of birth year', async () => {
  const { db, tmp, app } = setup();
  // Born in 1985, but month/day (08-27) matches FIXED_NOW's local month/day.
  db.prepare(`INSERT INTO customers (id, name, phone, birthday) VALUES (1, 'Alice', '0123456789', '1985-08-27')`).run();
  // A customer whose birthday is a different day entirely -- should NOT appear.
  db.prepare(`INSERT INTO customers (id, name, phone, birthday) VALUES (2, 'Bob', '0198765432', '1990-01-15')`).run();

  const agent = await loginAgent(app);
  const res = await agent.get('/api/dashboard/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.upcomingBirthdays.length, 1);
  assert.equal(res.body.upcomingBirthdays[0].id, 1);

  db.close(); fs.unlinkSync(tmp);
});
