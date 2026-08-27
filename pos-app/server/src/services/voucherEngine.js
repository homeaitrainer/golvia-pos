function isBirthdayToday(birthdayIso, today) {
  if (!birthdayIso) return false;
  // Parse month/day directly from string to avoid UTC/local timezone mismatch.
  // birthdayIso format is 'YYYY-MM-DD'; slice(5,7) = MM, slice(8,10) = DD
  const birthdayMonth = parseInt(birthdayIso.slice(5, 7), 10);
  const birthdayDay = parseInt(birthdayIso.slice(8, 10), 10);
  // today.getMonth() is 0-indexed, so add 1 to compare against MM
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  return birthdayMonth === todayMonth && birthdayDay === todayDay;
}

const TIER_ORDER = ['White', 'Silver', 'Gold', 'Platinum'];
const RULES_BY_TIER = {
  White: { value: 3, minSpend: 50 },
  Silver: { value: 5, minSpend: 100 },
  Gold: { value: 8, minSpend: 150 },
  Platinum: { value: 10, minSpend: 200 },
};

function monthlyVoucherRulesForTier(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return TIER_ORDER.slice(0, idx + 1).map(t => RULES_BY_TIER[t]);
}

function hasMetMonthlyEligibility(qualifyingDays) {
  return qualifyingDays.length >= 7;
}

function buildBirthdayVoucher(customerId, today) {
  const iso = today.toISOString();
  // Derive expires_at date from local date components to avoid UTC conversion.
  // toISOString() converts local time to UTC, which can shift the date backward
  // in positive UTC offsets (e.g., Malaysia UTC+8: 02:00 local = 18:00 UTC prev day).
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateOnly = `${year}-${month}-${day}`;
  return {
    customer_id: customerId,
    type: 'birthday',
    value: 10,
    min_spend: 0,
    issued_at: iso,
    expires_at: `${dateOnly}T23:59:59`,
  };
}

module.exports = { isBirthdayToday, monthlyVoucherRulesForTier, hasMetMonthlyEligibility, buildBirthdayVoucher };
