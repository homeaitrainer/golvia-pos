const test = require('node:test');
const assert = require('node:assert');
const { isBirthdayToday, monthlyVoucherRulesForTier, hasMetMonthlyEligibility, buildBirthdayVoucher } = require('../../src/services/voucherEngine');

test('isBirthdayToday matches month/day regardless of birth year', () => {
  assert.equal(isBirthdayToday('1990-08-27', new Date('2026-08-27')), true);
  assert.equal(isBirthdayToday('1990-08-27', new Date('2026-08-28')), false);
});

test('monthlyVoucherRulesForTier is cumulative by tier', () => {
  assert.deepEqual(monthlyVoucherRulesForTier('White'), [{ value: 3, minSpend: 50 }]);
  assert.deepEqual(monthlyVoucherRulesForTier('Silver'), [{ value: 3, minSpend: 50 }, { value: 5, minSpend: 100 }]);
  assert.deepEqual(monthlyVoucherRulesForTier('Gold'), [{ value: 3, minSpend: 50 }, { value: 5, minSpend: 100 }, { value: 8, minSpend: 150 }]);
  assert.deepEqual(monthlyVoucherRulesForTier('Platinum'), [{ value: 3, minSpend: 50 }, { value: 5, minSpend: 100 }, { value: 8, minSpend: 150 }, { value: 10, minSpend: 200 }]);
});

test('hasMetMonthlyEligibility requires 7 qualifying days', () => {
  assert.equal(hasMetMonthlyEligibility(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06']), false);
  assert.equal(hasMetMonthlyEligibility(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']), true);
});

test('buildBirthdayVoucher expires at end of the same day', () => {
  const v = buildBirthdayVoucher(42, new Date('2026-08-27T10:00:00'));
  assert.equal(v.customer_id, 42);
  assert.equal(v.type, 'birthday');
  assert.equal(v.value, 10);
  assert.equal(v.min_spend, 0);
  assert.ok(v.expires_at.startsWith('2026-08-27'));
});

test('isBirthdayToday parses date string components, not Date UTC conversion', () => {
  // Construct today using local-time constructor (not string-based UTC parsing).
  // Month is 0-indexed: 7 = August
  const today = new Date(2026, 7, 27, 10, 30, 0);
  // Birthday is Aug 27; should match today's local month/day regardless of UTC offset.
  assert.equal(isBirthdayToday('1990-08-27', today), true);
  // Different day should not match
  assert.equal(isBirthdayToday('1990-08-26', today), false);
  // Different month should not match
  assert.equal(isBirthdayToday('1990-07-27', today), false);
});

test('buildBirthdayVoucher uses local date for expires_at, not UTC conversion', () => {
  // Early morning local time: 02:00 on Aug 27 local (would be Aug 26 in UTC+8 offset).
  // This tests the fix: expires_at should use local date, not toISOString() UTC conversion.
  const today = new Date(2026, 7, 27, 2, 0, 0);
  const v = buildBirthdayVoucher(99, today);
  // expires_at date should reflect the local date (Aug 27), not UTC-converted date
  assert.equal(v.expires_at.substring(0, 10), '2026-08-27');
  assert.equal(v.type, 'birthday');
  assert.equal(v.value, 10);
  // Verify issued_at is still the full ISO instant (not affected by fix)
  assert.ok(v.issued_at.includes('T'));
});
