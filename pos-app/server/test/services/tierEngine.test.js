const test = require('node:test');
const assert = require('node:assert');
const { calculateTier } = require('../../src/services/tierEngine');

test('tier boundaries', () => {
  assert.equal(calculateTier(0), 'White');
  assert.equal(calculateTier(3000), 'White');
  assert.equal(calculateTier(3001), 'Silver');
  assert.equal(calculateTier(5000), 'Silver');
  assert.equal(calculateTier(5001), 'Gold');
  assert.equal(calculateTier(12000), 'Gold');
  assert.equal(calculateTier(12001), 'Platinum');
  assert.equal(calculateTier(999999), 'Platinum');
});
