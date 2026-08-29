// Client-side preview of what a sale will cost, so the cashier can tell the customer the amount
// BEFORE committing the sale. The server (server/src/services/checkoutService.js) remains
// authoritative and recomputes everything from its own sell_price -- this is a preview only, and
// the receipt always shows the server's figures.
//
// The order of operations below mirrors createInvoice() exactly and is load-bearing: each cap
// depends on the previous step's result (lump-sum caps at the post-item-discount amount, coins cap
// at what's left after that, the voucher caps at what's left after coins). Reordering these
// changes the answer. If checkoutService.js's calculation changes, change this in the same commit.

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * @param items    [{ unitPrice, quantity, itemDiscount }]
 * @param lumpSumDiscount  { type: 'amount' | 'percent', value } | null
 * @param coinsToRedeem    integer number of coins the cashier entered
 * @param voucher          { value, min_spend } | null
 */
export function quoteSale({ items = [], lumpSumDiscount = null, coinsToRedeem = 0, voucher = null } = {}) {
  let subtotal = 0;
  let itemDiscountTotal = 0;
  for (const item of items) {
    const lineValue = item.unitPrice * item.quantity;
    subtotal += lineValue;
    // Matches the server's per-line clamp: a discount can't exceed its own line's value, and a
    // negative discount can't inflate the line.
    itemDiscountTotal += clamp(Number(item.itemDiscount) || 0, 0, lineValue);
  }

  const afterItemDiscounts = subtotal - itemDiscountTotal;

  let lumpSum = 0;
  if (lumpSumDiscount && Number(lumpSumDiscount.value) > 0) {
    const raw = lumpSumDiscount.type === 'percent'
      ? afterItemDiscounts * (Number(lumpSumDiscount.value) / 100)
      : Number(lumpSumDiscount.value);
    lumpSum = clamp(raw, 0, afterItemDiscounts);
  }

  const remainingAfterDiscounts = afterItemDiscounts - lumpSum;

  // Over-redeeming coins is not an error on the server -- it caps the discount at the remaining
  // amount and only debits the coins actually applied. `coinsApplied` reflects that real debit so
  // the panel can show what the customer will actually be charged in coins.
  const requestedCoins = Number(coinsToRedeem) || 0;
  let coinDiscount = 0;
  let coinsApplied = 0;
  if (requestedCoins > 0) {
    coinDiscount = Math.min(requestedCoins / 100, Math.max(0, remainingAfterDiscounts));
    coinsApplied = Math.round(coinDiscount * 100);
  }

  // The server REJECTS a voucher that can't apply (min-spend unmet, or nothing left to discount)
  // rather than silently ignoring it. Surfacing the reason here lets the cashier fix it before
  // clicking Complete Sale instead of hitting an error afterwards.
  let voucherDiscount = 0;
  let voucherIssue = null;
  if (voucher) {
    if (remainingAfterDiscounts < voucher.min_spend) {
      voucherIssue = 'MIN_SPEND';
    } else {
      voucherDiscount = Math.min(voucher.value, Math.max(0, remainingAfterDiscounts - coinDiscount));
      if (voucherDiscount <= 0) {
        voucherIssue = 'NO_VALUE';
        voucherDiscount = 0;
      }
    }
  }

  const discountTotal = itemDiscountTotal + lumpSum + voucherDiscount;
  const total = Math.max(0, subtotal - discountTotal - coinDiscount);

  return {
    subtotal,
    itemDiscountTotal,
    lumpSum,
    coinDiscount,
    coinsApplied,
    voucherDiscount,
    voucherIssue,
    discountTotal,
    total,
  };
}
