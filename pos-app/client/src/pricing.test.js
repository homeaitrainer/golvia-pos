import test from 'node:test';
import assert from 'node:assert';
import { quoteSale } from './pricing.js';

const item = (unitPrice, quantity = 1, itemDiscount = 0) => ({ unitPrice, quantity, itemDiscount });

test('plain cart totals to the sum of its lines', () => {
  const q = quoteSale({ items: [item(40), item(48)] });
  assert.equal(q.subtotal, 88);
  assert.equal(q.total, 88);
});

test('quantity multiplies the line value', () => {
  const q = quoteSale({ items: [item(40, 3)] });
  assert.equal(q.subtotal, 120);
  assert.equal(q.total, 120);
});

test('item discounts come off before the lump-sum percentage is calculated', () => {
  // 300 - 30 = 270, then 10% of 270 = 27  ->  243. A percentage taken off the raw 300 would be 30.
  const q = quoteSale({
    items: [item(300, 1, 30)],
    lumpSumDiscount: { type: 'percent', value: 10 },
  });
  assert.equal(q.itemDiscountTotal, 30);
  assert.equal(q.lumpSum, 27);
  assert.equal(q.total, 243);
});

test('an item discount larger than its own line is clamped to the line value', () => {
  const q = quoteSale({ items: [item(40, 1, 999)] });
  assert.equal(q.itemDiscountTotal, 40);
  assert.equal(q.total, 0);
});

test('a lump-sum discount larger than the cart is capped, never producing a negative total', () => {
  const q = quoteSale({ items: [item(50)], lumpSumDiscount: { type: 'amount', value: 500 } });
  assert.equal(q.lumpSum, 50);
  assert.equal(q.total, 0);
});

test('coins redeem at 100 coins = RM1', () => {
  const q = quoteSale({ items: [item(300)], coinsToRedeem: 1000 });
  assert.equal(q.coinDiscount, 10);
  assert.equal(q.coinsApplied, 1000);
  assert.equal(q.total, 290);
});

test('over-redeeming coins caps the discount and only spends the coins actually applied', () => {
  // 5000 coins is RM50 of value against a RM20 cart: only RM20 (2000 coins) can be used.
  const q = quoteSale({ items: [item(20)], coinsToRedeem: 5000 });
  assert.equal(q.coinDiscount, 20);
  assert.equal(q.coinsApplied, 2000);
  assert.equal(q.total, 0);
});

test('a voucher applies after coins and is capped at what is left', () => {
  const q = quoteSale({
    items: [item(100)],
    coinsToRedeem: 1000, // RM10
    voucher: { value: 5, min_spend: 50 },
  });
  assert.equal(q.coinDiscount, 10);
  assert.equal(q.voucherDiscount, 5);
  assert.equal(q.voucherIssue, null);
  assert.equal(q.total, 85);
});

test('a voucher whose min spend is not met is flagged rather than silently applied', () => {
  const q = quoteSale({ items: [item(30)], voucher: { value: 5, min_spend: 50 } });
  assert.equal(q.voucherDiscount, 0);
  assert.equal(q.voucherIssue, 'MIN_SPEND');
  assert.equal(q.total, 30);
});

test('a voucher with nothing left to discount is flagged as NO_VALUE', () => {
  // Coins already bring the cart to zero, so the voucher has nothing to apply to -- the server
  // rejects this outright, so the cashier needs to see it before submitting.
  const q = quoteSale({
    items: [item(60)],
    coinsToRedeem: 6000, // RM60, the whole cart
    voucher: { value: 5, min_spend: 50 },
  });
  assert.equal(q.coinDiscount, 60);
  assert.equal(q.voucherDiscount, 0);
  assert.equal(q.voucherIssue, 'NO_VALUE');
  assert.equal(q.total, 0);
});

test('everything stacked together still floors at zero', () => {
  const q = quoteSale({
    items: [item(100, 2, 50)],
    lumpSumDiscount: { type: 'percent', value: 50 },
    coinsToRedeem: 99999,
    voucher: { value: 20, min_spend: 1 },
  });
  assert.equal(q.total, 0);
  assert.ok(q.coinsApplied <= 99999);
});

test('an empty cart quotes zero rather than NaN', () => {
  const q = quoteSale({ items: [] });
  assert.equal(q.subtotal, 0);
  assert.equal(q.total, 0);
});
