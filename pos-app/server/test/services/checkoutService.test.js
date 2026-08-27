const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { createInvoice } = require('../../src/services/checkoutService');

function setup() {
  const tmp = path.join(__dirname, `tmp-checkout-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 5)`).run();
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();
  return { db, tmp };
}

test('creates an invoice, decrements stock, credits coins, no discounts', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null,
    coinsToRedeem: 0,
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.invoice_number, 'INV-2026-0001');
  assert.equal(invoice.subtotal, 600);
  assert.equal(invoice.total, 600);
  assert.equal(invoice.coins_earned, 200); // floor(600/3)

  const variant = db.prepare('SELECT quantity FROM product_variants WHERE id = 1').get();
  assert.equal(variant.quantity, 3);

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.lifetime_coins, 200);
  assert.equal(account.current_coin_balance, 200);
  assert.equal(account.tier, 'White');

  db.close(); fs.unlinkSync(tmp);
});

test('applies per-item discount then lump-sum discount, coins earned on pre-discount price', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 30 }], // 300 - 30 = 270
    lumpSumDiscount: { type: 'percent', value: 10 }, // 10% off 270 = 27
    coinsToRedeem: 0,
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.subtotal, 300); // pre-discount
  assert.equal(invoice.discount_total, 57); // 30 + 27
  assert.equal(invoice.total, 243);
  assert.equal(invoice.coins_earned, 100); // floor(300/3), pre-discount

  db.close(); fs.unlinkSync(tmp);
});

test('redeeming coins reduces current balance but not lifetime coins or tier', () => {
  const { db, tmp } = setup();
  db.prepare('UPDATE membership_accounts SET lifetime_coins = 4000, current_coin_balance = 4000, tier = ? WHERE customer_id = 1').run('Silver');

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null,
    coinsToRedeem: 1000, // RM10 off
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.coins_redeemed, 1000);
  assert.equal(invoice.total, 290); // 300 - 10

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.current_coin_balance, 4000 - 1000 + 100); // redeemed then earned 100 from this 300 sale
  assert.equal(account.lifetime_coins, 4000 + 100);
  assert.equal(account.tier, 'Silver');

  db.close(); fs.unlinkSync(tmp);
});

test('throws INSUFFICIENT_STOCK when quantity exceeds stock', () => {
  const { db, tmp } = setup();
  assert.throws(() => {
    createInvoice(db, {
      customerId: 1,
      items: [{ variantId: 1, quantity: 999, unitPrice: 300, itemDiscount: 0 }],
      lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
    });
  }, /INSUFFICIENT_STOCK/);
  db.close(); fs.unlinkSync(tmp);
});

test('throws INSUFFICIENT_COINS when redeeming more than balance', () => {
  const { db, tmp } = setup();
  assert.throws(() => {
    createInvoice(db, {
      customerId: 1,
      items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
      lumpSumDiscount: null, coinsToRedeem: 500, paymentMethod: 'Cash',
    });
  }, /INSUFFICIENT_COINS/);
  db.close(); fs.unlinkSync(tmp);
});

test('redeeming more coins than the cart total caps discount and total at exactly 0, debiting only the coins actually used', () => {
  const { db, tmp } = setup();
  db.prepare('UPDATE membership_accounts SET lifetime_coins = 40000, current_coin_balance = 40000, tier = ? WHERE customer_id = 1').run('Gold');

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null,
    coinsToRedeem: 40000, // RM400 off, far more than the RM300 cart -- and equal to the full balance
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  // Discount capped at RM300 (the whole cart), so only 30000 coins (RM300) are actually used.
  assert.equal(invoice.coins_redeemed, 30000);
  assert.equal(invoice.total, 0); // capped at exactly 0, not negative

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  // Balance only debited for the 30000 coins actually applied, plus the 100 coins earned on this sale.
  assert.equal(account.current_coin_balance, 40000 - 30000 + 100);
  assert.equal(account.lifetime_coins, 40000 + 100);

  db.close(); fs.unlinkSync(tmp);
});

test('partial coin redemption within bounds is unaffected by the cap, even alongside item + lump-sum discounts', () => {
  const { db, tmp } = setup();
  db.prepare('UPDATE membership_accounts SET lifetime_coins = 4000, current_coin_balance = 4000, tier = ? WHERE customer_id = 1').run('Silver');

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 30 }], // 300 - 30 = 270
    lumpSumDiscount: { type: 'percent', value: 10 }, // 10% off 270 = 27 -> remaining 243
    coinsToRedeem: 1000, // RM10 off, well within the RM243 remaining
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.coins_redeemed, 1000); // not capped, requested amount used exactly
  assert.equal(invoice.total, 233); // 243 - 10

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.current_coin_balance, 4000 - 1000 + 100); // redeemed then earned 100 from floor(300/3)

  db.close(); fs.unlinkSync(tmp);
});

test('checking out with a valid, unredeemed, non-expired voucher applies its discount and marks it redeemed', () => {
  const { db, tmp } = setup();
  const voucherResult = db.prepare(`
    INSERT INTO vouchers (customer_id, type, value, min_spend, issued_at, expires_at)
    VALUES (1, 'monthly-tier', 5, 100, '2026-08-01T00:00:00', '2026-08-31T23:59:59')
  `).run();
  const voucherId = voucherResult.lastInsertRowid;

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }], // meets min_spend of 100
    lumpSumDiscount: null,
    coinsToRedeem: 0,
    paymentMethod: 'Cash',
    voucherId,
  }, new Date('2026-08-27'));

  assert.equal(invoice.discount_total, 5);
  assert.equal(invoice.total, 295); // 300 - 5

  const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(voucherId);
  assert.equal(voucher.redeemed_at, new Date('2026-08-27').toISOString());

  db.close(); fs.unlinkSync(tmp);
});

test('attempting to reuse an already-redeemed voucher throws INVALID_VOUCHER', () => {
  const { db, tmp } = setup();
  const voucherResult = db.prepare(`
    INSERT INTO vouchers (customer_id, type, value, min_spend, issued_at, expires_at, redeemed_at)
    VALUES (1, 'monthly-tier', 5, 50, '2026-08-01T00:00:00', '2026-08-31T23:59:59', '2026-08-10T12:00:00.000Z')
  `).run();
  const voucherId = voucherResult.lastInsertRowid;

  assert.throws(() => {
    createInvoice(db, {
      customerId: 1,
      items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
      lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash', voucherId,
    }, new Date('2026-08-27'));
  }, /INVALID_VOUCHER/);

  db.close(); fs.unlinkSync(tmp);
});

test('a voucher whose min_spend is not met by the cart throws INVALID_VOUCHER', () => {
  const { db, tmp } = setup();
  const voucherResult = db.prepare(`
    INSERT INTO vouchers (customer_id, type, value, min_spend, issued_at, expires_at)
    VALUES (1, 'monthly-tier', 10, 1000, '2026-08-01T00:00:00', '2026-08-31T23:59:59')
  `).run();
  const voucherId = voucherResult.lastInsertRowid;

  assert.throws(() => {
    createInvoice(db, {
      customerId: 1,
      items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }], // cart is only 300, well under min_spend 1000
      lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash', voucherId,
    }, new Date('2026-08-27'));
  }, /INVALID_VOUCHER/);

  db.close(); fs.unlinkSync(tmp);
});

test('server ignores a client-supplied unitPrice and always uses the DB sell_price for subtotal, invoice_items.unit_price, and coins', () => {
  const { db, tmp } = setup();
  // Variant 1's real sell_price (set up in setup()) is 300. The request lies and sends
  // unitPrice: 1 -- the server must not trust it.
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 1, itemDiscount: 0 }],
    lumpSumDiscount: null,
    coinsToRedeem: 0,
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.subtotal, 600); // 300 * 2, NOT 1 * 2
  assert.equal(invoice.total, 600);
  assert.equal(invoice.coins_earned, 200); // floor(600/3), based on the real price

  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);
  assert.equal(invoiceItem.unit_price, 300); // NOT 1

  db.close(); fs.unlinkSync(tmp);
});

test('a lump-sum RM amount discount larger than the cart caps total at 0, not negative', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: { type: 'amount', value: 500 }, // far more than the RM300 cart
    coinsToRedeem: 0,
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.discount_total, 300); // lump-sum capped at the cart value, not 500
  assert.equal(invoice.total, 0); // capped at exactly 0, not negative

  db.close(); fs.unlinkSync(tmp);
});

test('a lump-sum percent discount over 100% caps total at 0, not negative', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: { type: 'percent', value: 150 }, // 150% of 300 = 450
    coinsToRedeem: 0,
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.discount_total, 300); // capped at the cart value
  assert.equal(invoice.total, 0);

  db.close(); fs.unlinkSync(tmp);
});

test('a voucher that would discount RM0 because coin redemption already zeroed the total throws INVALID_VOUCHER, and the voucher stays unredeemed', () => {
  const { db, tmp } = setup();
  db.prepare('UPDATE membership_accounts SET lifetime_coins = 40000, current_coin_balance = 40000, tier = ? WHERE customer_id = 1').run('Gold');
  const voucherResult = db.prepare(`
    INSERT INTO vouchers (customer_id, type, value, min_spend, issued_at, expires_at)
    VALUES (1, 'monthly-tier', 5, 0, '2026-08-01T00:00:00', '2026-08-31T23:59:59')
  `).run();
  const voucherId = voucherResult.lastInsertRowid;

  assert.throws(() => {
    createInvoice(db, {
      customerId: 1,
      items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
      lumpSumDiscount: null,
      coinsToRedeem: 30000, // RM300 off -- the entire cart, leaving nothing for the voucher
      paymentMethod: 'Cash',
      voucherId,
    }, new Date('2026-08-27'));
  }, /INVALID_VOUCHER/);

  const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(voucherId);
  assert.equal(voucher.redeemed_at, null); // never marked as used
  assert.equal(voucher.redeemed_invoice_id, null);

  db.close(); fs.unlinkSync(tmp);
});

test('guest sale (no customerId) skips membership updates', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: null,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(invoice.coins_earned, 0);
  db.close(); fs.unlinkSync(tmp);
});
