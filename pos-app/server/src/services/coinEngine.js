function coinsEarnedForAmount(amount) {
  return Math.floor(amount / 3);
}

function coinsToDiscountValue(coins) {
  return coins / 100;
}

function discountValueToCoins(rm) {
  return Math.ceil(rm * 100);
}

module.exports = { coinsEarnedForAmount, coinsToDiscountValue, discountValueToCoins };
