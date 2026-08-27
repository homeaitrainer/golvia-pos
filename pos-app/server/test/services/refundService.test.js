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

test('refund proceeds and skips restock when underlying product was deleted', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));
  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  // Mirror the DELETE /api/products/:id route's two statements.
  db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(1);
  db.prepare('DELETE FROM products WHERE id = ?').run(1);

  const updatedInvoiceItem = db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(invoiceItem.id);
  assert.equal(updatedInvoiceItem.variant_id, null); // confirms ON DELETE SET NULL took effect

  let refund;
  assert.doesNotThrow(() => {
    refund = createRefund(db, {
      invoiceId: invoice.id,
      lines: [{ invoiceItemId: invoiceItem.id, quantity: 2 }],
      paymentMethod: 'Cash',
    }, new Date('2026-08-28'));
  });

  assert.equal(refund.refund_amount, 600);
  assert.equal(refund.coins_reversed, 200);

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.lifetime_coins, 0);
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

test('full refund of an invoice with item discount + lump-sum discount + coin redemption refunds exactly invoice.total, and fully restores both earned and redeemed coins', () => {
  const { db, tmp } = setup();
  db.prepare('UPDATE membership_accounts SET lifetime_coins = 4000, current_coin_balance = 4000, tier = ? WHERE customer_id = 1').run('Silver');

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 20 }], // value = 300*2 - 20 = 580
    lumpSumDiscount: { type: 'flat', value: 58 }, // remaining = 580 - 58 = 522
    coinsToRedeem: 1000, // RM10 off, well within the 522 remaining
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  // subtotal 600, discount_total 78 (20 + 58), total = 600 - 78 - 10 = 512
  assert.equal(invoice.total, 512);
  assert.equal(invoice.coins_earned, 200); // floor(600/3)
  assert.equal(invoice.coins_redeemed, 1000);

  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  const refund = createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 2 }], // full return
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));

  // Old buggy formula (unit_price - item_discount/qty) * qty = (300 - 10) * 2 = 580, which
  // ignores the lump-sum discount and coin redemption and over-refunds. Correct behavior: a
  // full return refunds exactly what was actually collected (invoice.total).
  assert.equal(refund.refund_amount, invoice.total);
  assert.equal(refund.refund_amount, 512);

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  // Fully reversing both the 200 earned coins and returning the 1000 redeemed coins restores
  // the balance and lifetime total exactly back to their pre-sale values.
  assert.equal(account.current_coin_balance, 4000);
  assert.equal(account.lifetime_coins, 4000);

  db.close(); fs.unlinkSync(tmp);
});

test('partial refund of one line from a multi-line invoice (mixed line values) prorates by value, not quantity', () => {
  const { db, tmp } = setup();
  db.prepare(`INSERT INTO products (id, name) VALUES (2, 'Bracelet')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (2, 2, 'One size', 'SKU-2', 30, 100, 5)`).run();
  db.prepare('UPDATE membership_accounts SET lifetime_coins = 2000, current_coin_balance = 2000, tier = ? WHERE customer_id = 1').run('White');

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [
      { variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }, // line value 300
      { variantId: 2, quantity: 1, unitPrice: 100, itemDiscount: 0 }, // line value 100
    ],
    lumpSumDiscount: { type: 'flat', value: 40 }, // remaining = 400 - 40 = 360
    coinsToRedeem: 200, // RM2 off, well within 360
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  // subtotal 400, discount_total 40, total = 400 - 40 - 2 = 358
  assert.equal(invoice.total, 358);
  assert.equal(invoice.coins_earned, 133); // floor(400/3)

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(invoice.id);
  const braceletLine = items.find((i) => i.variant_id === 2);

  const refund = createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: braceletLine.id, quantity: 1 }], // return only the RM100 line
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));

  // Value-based ratio: 100 / (300 + 100) = 0.25 (NOT the quantity-based 1/2 = 0.5 the old
  // code would have used, which would over-refund and over-reverse coins for this cheap line).
  assert.equal(refund.refund_amount, 89.5); // 358 * 0.25
  assert.ok(refund.refund_amount < invoice.total, 'partial refund must be proportionally less than the full total');

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.lifetime_coins, 2000 + 133 - 33); // earned 133, reverse round(133*0.25)=33
  assert.equal(account.current_coin_balance, 2000 - 200 + 133 - 33 + 50); // redeemed 200, earned 133, reverse 33, return round(200*0.25)=50

  const updatedInvoice = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id);
  assert.equal(updatedInvoice.status, 'partially-refunded');

  db.close(); fs.unlinkSync(tmp);
});

test('refunding an invoice with coin redemption returns the redeemed coins to current_coin_balance without touching lifetime_coins beyond the earned-coin reversal', () => {
  const { db, tmp } = setup();
  db.prepare('UPDATE membership_accounts SET lifetime_coins = 1000, current_coin_balance = 1000, tier = ? WHERE customer_id = 1').run('White');

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null,
    coinsToRedeem: 500, // RM5 off
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.total, 295); // 300 - 5
  assert.equal(invoice.coins_earned, 100); // floor(300/3)
  assert.equal(invoice.coins_redeemed, 500);

  // After the sale: balance = 1000 - 500 (redeemed) + 100 (earned) = 600
  let account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.current_coin_balance, 600);

  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  const refund = createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 1 }],
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));

  assert.equal(refund.refund_amount, 295);

  account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  // Redeemed coins (500) are returned to current_coin_balance on top of the earned-coin (100)
  // reversal, restoring the balance to exactly its pre-sale value.
  assert.equal(account.current_coin_balance, 1000);
  // lifetime_coins is only ever affected by the earned-coin reversal, never by redeemed coins.
  assert.equal(account.lifetime_coins, 1000);

  db.close(); fs.unlinkSync(tmp);
});

test('refunding an invoiceItemId that belongs to a DIFFERENT invoice throws INVOICE_ITEM_NOT_FOUND', () => {
  const { db, tmp } = setup();

  const invoiceA = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));
  const invoiceB = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  const itemFromInvoiceB = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoiceB.id);

  // Attempt to refund invoice A using an invoice_item id that actually belongs to invoice B.
  assert.throws(() => {
    createRefund(db, {
      invoiceId: invoiceA.id,
      lines: [{ invoiceItemId: itemFromInvoiceB.id, quantity: 1 }],
      paymentMethod: 'Cash',
    }, new Date('2026-08-28'));
  }, /INVOICE_ITEM_NOT_FOUND/);

  db.close(); fs.unlinkSync(tmp);
});

test('refunding the same line twice, where the second refund exceeds what remains, throws REFUND_QUANTITY_EXCEEDS_REMAINING', () => {
  const { db, tmp } = setup();

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));
  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  // First refund takes both units.
  createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 2 }],
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));

  // Nothing is left to refund; requesting 1 more must be rejected.
  assert.throws(() => {
    createRefund(db, {
      invoiceId: invoice.id,
      lines: [{ invoiceItemId: invoiceItem.id, quantity: 1 }],
      paymentMethod: 'Cash',
    }, new Date('2026-08-29'));
  }, /REFUND_QUANTITY_EXCEEDS_REMAINING/);

  db.close(); fs.unlinkSync(tmp);
});

test('a valid partial refund followed by a second valid partial refund for the remaining quantity succeeds and marks the invoice fully refunded', () => {
  const { db, tmp } = setup();

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));
  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  const firstRefund = createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 1 }],
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));
  assert.equal(firstRefund.refund_amount, 300);

  let afterFirst = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id);
  assert.equal(afterFirst.status, 'partially-refunded');

  // Second refund for exactly the remaining quantity (1) must succeed, not be blocked by the
  // first refund's already-refunded quantity.
  const secondRefund = createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 1 }],
    paymentMethod: 'Cash',
  }, new Date('2026-08-29'));
  assert.equal(secondRefund.refund_amount, 300);

  const variant = db.prepare('SELECT quantity FROM product_variants WHERE id = 1').get();
  assert.equal(variant.quantity, 5); // fully restocked across both refunds

  const finalInvoice = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id);
  assert.equal(finalInvoice.status, 'refunded');

  db.close(); fs.unlinkSync(tmp);
});

test('refunding with a missing/empty lines array throws INVALID_REFUND_LINES', () => {
  const { db, tmp } = setup();

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.throws(() => {
    createRefund(db, { invoiceId: invoice.id, lines: [], paymentMethod: 'Cash' }, new Date('2026-08-28'));
  }, /INVALID_REFUND_LINES/);

  assert.throws(() => {
    createRefund(db, { invoiceId: invoice.id, lines: undefined, paymentMethod: 'Cash' }, new Date('2026-08-28'));
  }, /INVALID_REFUND_LINES/);

  db.close(); fs.unlinkSync(tmp);
});

test('refunding a nonexistent invoiceItemId throws INVOICE_ITEM_NOT_FOUND instead of crashing', () => {
  const { db, tmp } = setup();

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.throws(() => {
    createRefund(db, {
      invoiceId: invoice.id,
      lines: [{ invoiceItemId: 999999, quantity: 1 }],
      paymentMethod: 'Cash',
    }, new Date('2026-08-28'));
  }, /INVOICE_ITEM_NOT_FOUND/);

  db.close(); fs.unlinkSync(tmp);
});
