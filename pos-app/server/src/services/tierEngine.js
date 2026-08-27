function calculateTier(lifetimeCoins) {
  if (lifetimeCoins >= 12001) return 'Platinum';
  if (lifetimeCoins >= 5001) return 'Gold';
  if (lifetimeCoins >= 3001) return 'Silver';
  return 'White';
}

module.exports = { calculateTier };
