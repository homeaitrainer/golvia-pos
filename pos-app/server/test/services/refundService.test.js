const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { createInvoice } = require('../../src/services/checkoutService');
const { createRefund } = require('../../src/services/refundService');

function setup() {
  const tmp = path.join(__dirname, `tmp-refund-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 5)`).run();
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();
  return { db, tmp };
}

test('full return restocks item, reverses coins, marks invoice refunded', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));
  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  const refund = createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 2 }],
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));

  assert.equal(refund.refund_amount, 600);

  const variant = db.prepare('SELECT quantity FROM product_variants WHERE id = 1').get();
  assert.equal(variant.quantity, 5); // restocked back to original

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.lifetime_coins, 0); // 200 earned, fully reversed
  assert.equal(account.current_coin_balance, 0);

  const updatedInvoice = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id);
  assert.equal(updatedInvoice.status, 'refunded');

  db.close(); fs.unlinkSync(tmp);
});

test('partial return reverses proportional coins and marks partially-refunded', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }], // earns 200 coins total
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));
  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 1 }], // return half
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.lifetime_coins, 100); // half of 200 reversed

  const updatedInvoice = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id);
  assert.equal(updatedInvoice.status, 'partially-refunded');

  db.close(); fs.unlinkSync(tmp);
});
