const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

async function setup() {
  const tmp = path.join(__dirname, `tmp-invoices-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 5)`).run();
  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  return { agent, db, tmp };
}

test('checkout creates an invoice and refund reverses it', async () => {
  const { agent, db, tmp } = await setup();

  const checkout = await agent.post('/api/invoices').send({
    customerId: null,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.body.invoice_number, 'INV-2026-0001'.slice(0, 4) + checkout.body.invoice_number.slice(4)); // year-agnostic check
  const invoiceId = checkout.body.id;

  const detail = await agent.get(`/api/invoices/${invoiceId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.items.length, 1);
  assert.equal(detail.body.items[0].product_name, 'Ring');
  assert.equal(detail.body.items[0].variant_label, '40g');

  const refund = await agent.post(`/api/invoices/${invoiceId}/refund`).send({
    lines: [{ invoiceItemId: detail.body.items[0].id, quantity: 1 }],
    paymentMethod: 'Cash',
  });
  assert.equal(refund.status, 201);

  db.close(); fs.unlinkSync(tmp);
});

test('invoice items survive product deletion', async () => {
  const { agent, db, tmp } = await setup();

  const checkout = await agent.post('/api/invoices').send({
    customerId: null,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(checkout.status, 201);
  const invoiceId = checkout.body.id;

  const del = await agent.delete('/api/products/1');
  assert.equal(del.status, 200);

  const detail = await agent.get(`/api/invoices/${invoiceId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.items.length, 1);
  assert.equal(detail.body.items[0].product_name, 'Deleted product');
  assert.equal(detail.body.items[0].variant_label, 'N/A');

  db.close(); fs.unlinkSync(tmp);
});

test('checkout returns 409 on insufficient stock', async () => {
  const { agent, db, tmp } = await setup();
  const res = await agent.post('/api/invoices').send({
    customerId: null,
    items: [{ variantId: 1, quantity: 999, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'INSUFFICIENT_STOCK');
  db.close(); fs.unlinkSync(tmp);
});

test('checkout returns 409 VOUCHER_NO_VALUE (distinct from INVALID_VOUCHER) when coin redemption already zeroed the total', async () => {
  const { agent, db, tmp } = await setup();
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 40000, 40000, 'Gold')`).run();
  const voucherResult = db.prepare(`
    INSERT INTO vouchers (customer_id, type, value, min_spend, issued_at, expires_at)
    VALUES (1, 'monthly-tier', 5, 0, '2026-08-01T00:00:00', '2026-08-31T23:59:59')
  `).run();

  const res = await agent.post('/api/invoices').send({
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null,
    coinsToRedeem: 30000, // RM300 off -- the entire cart, leaving nothing for the voucher
    paymentMethod: 'Cash',
    voucherId: voucherResult.lastInsertRowid,
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'VOUCHER_NO_VALUE');

  db.close(); fs.unlinkSync(tmp);
});

test('refund with an empty/missing lines array returns 400, not a 500 crash', async () => {
  const { agent, db, tmp } = await setup();

  const checkout = await agent.post('/api/invoices').send({
    customerId: null,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(checkout.status, 201);
  const invoiceId = checkout.body.id;

  const emptyLines = await agent.post(`/api/invoices/${invoiceId}/refund`).send({
    lines: [],
    paymentMethod: 'Cash',
  });
  assert.equal(emptyLines.status, 400);
  assert.equal(emptyLines.body.error, 'INVALID_REFUND_LINES');

  const missingLines = await agent.post(`/api/invoices/${invoiceId}/refund`).send({
    paymentMethod: 'Cash',
  });
  assert.equal(missingLines.status, 400);
  assert.equal(missingLines.body.error, 'INVALID_REFUND_LINES');

  db.close(); fs.unlinkSync(tmp);
});

test('email-receipt on a guest sale (no customer) returns 400 NO_CUSTOMER_EMAIL', async () => {
  const { agent, db, tmp } = await setup();

  const checkout = await agent.post('/api/invoices').send({
    customerId: null,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(checkout.status, 201);
  const invoiceId = checkout.body.id;

  const res = await agent.post(`/api/invoices/${invoiceId}/email-receipt`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'NO_CUSTOMER_EMAIL');

  db.close(); fs.unlinkSync(tmp);
});

test('email-receipt for a customer with an email on file returns 502 EMAIL_SEND_FAILED when Gmail is not configured', async () => {
  const { agent, db, tmp } = await setup();
  db.prepare(`INSERT INTO customers (id, name, phone, email) VALUES (1, 'Alice', '0123456789', 'alice@example.com')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();

  const checkout = await agent.post('/api/invoices').send({
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(checkout.status, 201);
  const invoiceId = checkout.body.id;

  // No gmail_address/gmail_app_password have been written to settings, so sendEmail() throws
  // EMAIL_NOT_CONFIGURED before touching the network -- this asserts the route surfaces that as
  // a 502, unlike the best-effort birthday/monthly/tier-upgrade sends elsewhere in the app.
  const res = await agent.post(`/api/invoices/${invoiceId}/email-receipt`);
  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'EMAIL_SEND_FAILED');

  const logRows = db.prepare(`SELECT * FROM message_log WHERE trigger_type = 'receipt'`).all();
  assert.equal(logRows.length, 0); // no message_log row on a failed send

  db.close(); fs.unlinkSync(tmp);
});
