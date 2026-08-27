const test = require('node:test');
const assert = require('node:assert');
const { coinsEarnedForAmount, coinsToDiscountValue, discountValueToCoins } = require('../../src/services/coinEngine');

test('coinsEarnedForAmount floors RM3=1coin', () => {
  assert.equal(coinsEarnedForAmount(0), 0);
  assert.equal(coinsEarnedForAmount(2.99), 0);
  assert.equal(coinsEarnedForAmount(3), 1);
  assert.equal(coinsEarnedForAmount(8), 2);
  assert.equal(coinsEarnedForAmount(299), 99);
});

test('coinsToDiscountValue: 100 coins = RM1', () => {
  assert.equal(coinsToDiscountValue(100), 1);
  assert.equal(coinsToDiscountValue(1000), 10);
  assert.equal(coinsToDiscountValue(50), 0.5);
});

test('discountValueToCoins is inverse for whole RM values', () => {
  assert.equal(discountValueToCoins(10), 1000);
  assert.equal(discountValueToCoins(0.5), 50);
});
