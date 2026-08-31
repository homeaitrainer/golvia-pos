const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { createAdmin, verifyLogin } = require('../../src/services/authService');
const { createInvoice } = require('../../src/services/checkoutService');
const { resetForGoLive, summarise } = require('../../src/services/resetForGoLive');

// Builds a database in the state the shop would be in after a day of testing: a catalogue, an
// admin, saved settings, a customer with coins, and a real sale that decremented stock.
function seedTestedShop() {
  const tmp = path.join(__dirname, `tmp-reset-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'admin123');
  db.prepare("INSERT INTO settings (key, value) VALUES ('gmail_address', 'shop@example.com')").run();
  db.prepare("INSERT INTO products (id, name, short_name) VALUES (1, 'Full Name', 'Ring')").run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, barcode, cost_price, sell_price, quantity)
              VALUES (1, 1, 'A', 'R-1', '9551234567890', 10, 100, 50)`).run();
  db.prepare("INSERT INTO customers (id, name, phone) VALUES (1, 'Test Person', '0123456789')").run();
  db.prepare("INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 400, 400, 'White')").run();
  db.prepare("INSERT INTO stock_adjustments (variant_id, delta, reason) VALUES (1, 5, 'test restock')").run();

  createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 3, unitPrice: 100, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });

  return { db, tmp };
}

test('reset clears test trading data but keeps catalogue, login and settings', () => {
  const { db, tmp } = seedTestedShop();
  assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, 1);

  const result = resetForGoLive(db);

  for (const table of ['invoices', 'invoice_items', 'customers', 'membership_accounts', 'stock_adjustments', 'vouchers', 'refunds', 'message_log']) {
    assert.equal(db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c, 0, `${table} should be empty`);
  }

  // The things that took real work to set up survive.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM products').get().c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM product_variants').get().c, 1);
  const variant = db.prepare('SELECT * FROM product_variants').get();
  assert.equal(variant.barcode, '9551234567890');   // assigned barcodes survive
  assert.equal(variant.sell_price, 100);            // prices survive
  assert.equal(db.prepare('SELECT short_name FROM products').get().short_name, 'Ring');
  assert.equal(verifyLogin(db, 'admin', 'admin123'), true);
  assert.equal(db.prepare("SELECT value FROM settings WHERE key='gmail_address'").get().value, 'shop@example.com');

  assert.equal(result.cleared.invoices, 1);
  db.close(); fs.unlinkSync(tmp);
});

test('reset restores opening stock, undoing what the test sales consumed', () => {
  const { db, tmp } = seedTestedShop();
  // The seeded sale took 3 of 50.
  assert.equal(db.prepare("SELECT quantity FROM product_variants WHERE sku='R-1'").get().quantity, 47);

  const result = resetForGoLive(db, { stockByVariantSku: new Map([['R-1', 50]]) });

  assert.equal(db.prepare("SELECT quantity FROM product_variants WHERE sku='R-1'").get().quantity, 50);
  assert.equal(result.variantsRestocked, 1);
  db.close(); fs.unlinkSync(tmp);
});

test('reset without opening stock leaves quantities untouched', () => {
  const { db, tmp } = seedTestedShop();
  resetForGoLive(db);
  assert.equal(db.prepare("SELECT quantity FROM product_variants WHERE sku='R-1'").get().quantity, 47);
  db.close(); fs.unlinkSync(tmp);
});

test('invoice numbering restarts at 0001 once the test sales are gone', () => {
  const { db, tmp } = seedTestedShop();
  resetForGoLive(db, { stockByVariantSku: new Map([['R-1', 50]]) });

  db.prepare("INSERT INTO customers (id, name, phone) VALUES (9, 'Real Customer', '0199999999')").run();
  db.prepare("INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (9, 0, 0, 'White')").run();
  const firstRealSale = createInvoice(db, {
    customerId: 9,
    items: [{ variantId: 1, quantity: 1, unitPrice: 100, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });

  assert.match(firstRealSale.invoice_number, /-0001$/);
  db.close(); fs.unlinkSync(tmp);
});

test('summarise reports counts without changing anything (the dry run)', () => {
  const { db, tmp } = seedTestedShop();
  const before = summarise(db);
  assert.equal(before.willClear.invoices, 1);
  assert.equal(before.willKeep.products, 1);
  // Nothing was touched by merely summarising.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, 1);
  db.close(); fs.unlinkSync(tmp);
});
