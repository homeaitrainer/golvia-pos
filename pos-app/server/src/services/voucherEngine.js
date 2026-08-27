function isBirthdayToday(birthdayIso, today) {
  if (!birthdayIso) return false;
  const b = new Date(birthdayIso);
  return b.getMonth() === today.getMonth() && b.getDate() === today.getDate();
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
  const dateOnly = iso.slice(0, 10);
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
