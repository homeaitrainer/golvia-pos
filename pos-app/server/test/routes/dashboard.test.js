const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

test('dashboard summary reports low stock and today totals', async () => {
  const tmp = path.join(__dirname, `tmp-dash-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity, low_stock_threshold) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 1, 3)`).run();
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method, created_at) VALUES ('INV-2026-0001', 300, 300, 'Cash', datetime('now'))`).run();

  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });

  const res = await agent.get('/api/dashboard/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.todayTransactionCount, 1);
  assert.equal(res.body.todaySalesTotal, 300);
  assert.equal(res.body.lowStockVariants.length, 1);

  db.close(); fs.unlinkSync(tmp);
});
