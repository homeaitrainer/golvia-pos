const { nextInvoiceNumber } = require('./invoiceNumbering');
const { coinsEarnedForAmount, coinsToDiscountValue } = require('./coinEngine');
const { calculateTier } = require('./tierEngine');
const { sendEmail } = require('./emailService');

// Best-effort notification, mirroring voucherIssuance.js's notifyCustomer: a tier-upgrade email
// must never affect the (already-committed) checkout. sendEmail() is async and rejects rather
// than throwing synchronously, so this is wired with .then/.catch rather than try/catch. A
// message_log row is written ONLY on a confirmed successful send.
function notifyTierUpgrade(db, customer, newTier) {
  if (!customer || !customer.email) return;
  const subject = `You've been upgraded to GOLVIA ${newTier}!`;
  const html = `<p>Congratulations, ${customer.name}!</p><p>You've been upgraded to <strong>GOLVIA ${newTier}</strong> tier. Enjoy your new benefits on your next visit.</p>`;
  sendEmail(db, { to: customer.email, subject, html })
    .then(() => {
      db.prepare(`
        INSERT INTO message_log (customer_id, channel, trigger_type) VALUES (?, 'email', 'tier-upgrade')
      `).run(customer.id);
    })
    .catch((err) => {
      console.warn(`Failed to send tier-upgrade email to customer ${customer.id}:`, err.message);
    });
}

function createInvoice(db, params, now = new Date()) {
  const { customerId, items: rawItems, lumpSumDiscount, coinsToRedeem, paymentMethod, voucherId } = params;

  // Validate request shape before ANY DB work (including before opening the transaction below),
  // so a malformed request can never mutate stock or create a partial invoice.
  //
  // A crafted request bypassing the normal UI could send a negative or non-integer quantity,
  // which would otherwise: pass the stock-sufficiency check below (a negative number is never
  // greater than available stock), then INCREASE stock on "checkout" (decrementStock.run(-1, id)
  // subtracts a negative), produce a negative subtotal contribution that can drive
  // coinsEarnedForAmount negative (silently decrementing the customer's lifetime coins/tier), and
  // -- combined with other positive-quantity lines in the same cart -- inflate a later
  // value-based refund proration into a real overpayment.
  //
  // itemDiscount gets the same treatment but for a different reason: a NaN/string/negative
  // discount is rejected outright rather than silently clamped like a legitimate-but-oversized
  // discount is further below, because malformed input indicates a client-side bug that should
  // surface immediately rather than be papered over by a clamp.
  for (const item of rawItems) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('INVALID_ITEM_QUANTITY');
    }
    if (item.itemDiscount != null && (!Number.isFinite(item.itemDiscount) || item.itemDiscount < 0)) {
      throw new Error('INVALID_ITEM_QUANTITY');
    }
    if (!Number.isInteger(Number(item.variantId))) {
      throw new Error('INVALID_ITEM_QUANTITY');
    }
  }

  // Normalize variantId to a consistent Number type before it's used as a Map key below (stock
  // aggregation, unit-price lookup). Without this, a request mixing types across lines for the
  // same underlying row (e.g. variantId: 1 on one line, variantId: '1' on another -- the same
  // row to SQLite's integer column affinity) would hash to two different Map keys, silently
  // bypassing the aggregate stock-sufficiency check below.
  const items = rawItems.map(item => ({ ...item, variantId: Number(item.variantId) }));

  // Populated inside the transaction below (synchronously -- better-sqlite3 transactions run
  // synchronously) when this sale changes the customer's tier, then read after tx() returns to
  // fire the notification outside the transaction -- a slow SMTP call has no business running
  // inside a synchronous DB transaction.
  let tierUpgrade = null;

  const tx = db.transaction(() => {
    // Fetch each distinct variant's current quantity and authoritative sell_price once -- the
    // unit price used for subtotal, invoice_items.unit_price, and coin calculations below is
    // ALWAYS this DB-fetched value, never the client-supplied item.unitPrice. Trusting a
    // client-supplied price would let anyone invoice an item at whatever price they send.
    const variantsById = new Map();
    for (const item of items) {
      if (!variantsById.has(item.variantId)) {
        const variant = db.prepare('SELECT quantity, sell_price FROM product_variants WHERE id = ?').get(item.variantId);
        if (!variant) throw new Error('INSUFFICIENT_STOCK');
        variantsById.set(item.variantId, variant);
      }
    }

    // Validate stock sufficiency using the AGGREGATE requested quantity per distinct variantId,
    // not each line independently -- two separate lines referencing the same variantId (e.g. a
    // scanned item added twice as distinct lines) must not each individually pass a check whose
    // combined total oversells past zero stock.
    const requestedQtyByVariant = new Map();
    for (const item of items) {
      requestedQtyByVariant.set(item.variantId, (requestedQtyByVariant.get(item.variantId) || 0) + item.quantity);
    }
    for (const [variantId, requestedQty] of requestedQtyByVariant) {
      if (variantsById.get(variantId).quantity < requestedQty) {
        throw new Error('INSUFFICIENT_STOCK');
      }
    }

    // Clamp each line's client-supplied itemDiscount to [0, unitPrice * quantity] using the
    // server-authoritative sell_price (never the client-sent price) so a discount can't exceed
    // that line's own value (which would make its net contribution negative) or be negative
    // itself (which would inflate the line's value instead of discounting it). This clamped
    // value is used everywhere itemDiscount previously was: subtotal/discount accumulation here,
    // and what gets persisted to invoice_items.item_discount below.
    // Indexed by position in `items` (not by variantId) so this stays correct even if a caller
    // sends the same variantId across multiple lines with different discounts.
    const clampedItemDiscounts = [];
    let subtotal = 0;
    let itemDiscountTotal = 0;
    for (const item of items) {
      const unitPrice = variantsById.get(item.variantId).sell_price;
      const lineValue = unitPrice * item.quantity;
      const clampedItemDiscount = Math.max(0, Math.min(item.itemDiscount || 0, lineValue));
      clampedItemDiscounts.push(clampedItemDiscount);
      subtotal += lineValue;
      itemDiscountTotal += clampedItemDiscount;
    }

    const afterItemDiscounts = subtotal - itemDiscountTotal;
    let lumpSumAmount = 0;
    if (lumpSumDiscount) {
      lumpSumAmount = lumpSumDiscount.type === 'percent'
        ? afterItemDiscounts * (lumpSumDiscount.value / 100)
        : lumpSumDiscount.value;
      // Cap the lump-sum discount so it can reduce the price to 0 but no further, and floor it
      // at 0 so a negative lump-sum value can't act as a surcharge that increases the total
      // above the pre-discount subtotal. This must happen BEFORE the coin-redemption cap below,
      // so that cap (and the voucher cap after it) works off a sane, non-negative baseline
      // instead of compounding an already-negative one.
      lumpSumAmount = Math.max(0, Math.min(lumpSumAmount, afterItemDiscounts));
    }

    // Coins can discount at most what's left after item + lump-sum discounts, so the total
    // never goes negative.
    const remainingAfterDiscounts = afterItemDiscounts - lumpSumAmount;
    const maxRedeemableValue = Math.max(0, remainingAfterDiscounts);

    // Reject a malformed coinsToRedeem (non-integer or negative) outright rather than letting it
    // flow into the integer invoices.coins_redeemed column or silently no-op -- same class of
    // request-shape problem as the item quantity/discount validation above, so it reuses that
    // error code.
    if (coinsToRedeem && (!Number.isInteger(coinsToRedeem) || coinsToRedeem < 0)) {
      throw new Error('INVALID_ITEM_QUANTITY');
    }

    let coinsRedeemed = 0;
    let coinDiscountValue = 0;
    if (coinsToRedeem && coinsToRedeem > 0) {
      if (!customerId) throw new Error('INSUFFICIENT_COINS');
      const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(customerId);
      if (!account || account.current_coin_balance < coinsToRedeem) {
        throw new Error('INSUFFICIENT_COINS');
      }
      coinsRedeemed = coinsToRedeem;
      coinDiscountValue = coinsToDiscountValue(coinsRedeemed);
      if (coinDiscountValue > maxRedeemableValue) {
        // Over-redemption: cap the discount at exactly the remaining amount (total -> 0),
        // and only debit the customer for the coins actually applied.
        coinDiscountValue = maxRedeemableValue;
        coinsRedeemed = Math.round(coinDiscountValue * 100);
      }
    }

    // Voucher redemption: scoped to this invoice's own customer (prevents redeeming someone
    // else's voucher), must be unredeemed and unexpired, and the cart -- after item + lump-sum
    // discounts, before coins -- must meet its min_spend. Applied AFTER coins as a flat RM
    // discount, capped at whatever's left so total never goes negative (mirrors the coin
    // over-redemption cap above).
    let voucher = null;
    let voucherDiscountValue = 0;
    if (voucherId) {
      voucher = db.prepare('SELECT * FROM vouchers WHERE id = ? AND customer_id = ?').get(voucherId, customerId);
      if (!voucher || voucher.redeemed_at) throw new Error('INVALID_VOUCHER');
      if (voucher.expires_at && new Date(voucher.expires_at) < now) throw new Error('INVALID_VOUCHER');
      if (remainingAfterDiscounts < voucher.min_spend) throw new Error('INVALID_VOUCHER');

      const remainingAfterCoins = Math.max(0, remainingAfterDiscounts - coinDiscountValue);
      voucherDiscountValue = Math.min(voucher.value, remainingAfterCoins);
      // Nothing left for the voucher to discount (e.g. coin redemption already brought the
      // total to 0) -- reject it instead of silently redeeming it for zero benefit, but with a
      // DISTINCT error from the other voucher validation failures (not found, wrong customer,
      // already redeemed, expired, min-spend not met) so the caller can tell the cashier
      // specifically that reducing the coin redemption would let the voucher apply. This check
      // runs before the voucher is ever marked redeemed (below), so the customer keeps it.
      if (voucherDiscountValue <= 0) throw new Error('VOUCHER_NO_VALUE');
    }

    const discountTotal = itemDiscountTotal + lumpSumAmount + voucherDiscountValue;
    // Defensive floor: the per-discount-type caps above (lump-sum capped at afterItemDiscounts,
    // coins and voucher each capped at what's left) should make a negative total unreachable in
    // normal operation, but this guards against any other edge case still producing one -- a
    // negative total would flow into refundService.js as a negative refund_amount, i.e. money
    // taken FROM the customer.
    const total = Math.max(0, subtotal - discountTotal - coinDiscountValue);
    const coinsEarned = customerId ? coinsEarnedForAmount(subtotal) : 0;

    const invoiceNumber = nextInvoiceNumber(db, now);
    const insertInvoice = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, subtotal, discount_total, coins_redeemed, coins_earned, total, payment_method, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
    `);
    const result = insertInvoice.run(
      invoiceNumber, customerId, subtotal, discountTotal, coinsRedeemed, coinsEarned, total, paymentMethod, now.toISOString()
    );
    const invoiceId = result.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, variant_id, quantity, unit_price, item_discount) VALUES (?, ?, ?, ?, ?)
    `);
    const decrementStock = db.prepare('UPDATE product_variants SET quantity = quantity - ? WHERE id = ?');
    items.forEach((item, idx) => {
      const unitPrice = variantsById.get(item.variantId).sell_price;
      insertItem.run(invoiceId, item.variantId, item.quantity, unitPrice, clampedItemDiscounts[idx]);
      decrementStock.run(item.quantity, item.variantId);
    });

    if (customerId) {
      const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(customerId);
      const newLifetime = account.lifetime_coins + coinsEarned;
      const newBalance = account.current_coin_balance - coinsRedeemed + coinsEarned;
      const newTier = calculateTier(newLifetime);
      db.prepare(`
        UPDATE membership_accounts SET lifetime_coins = ?, current_coin_balance = ?, tier = ?, tier_updated_at = ?
        WHERE customer_id = ?
      `).run(newLifetime, newBalance, newTier, now.toISOString(), customerId);
      if (newTier !== account.tier) {
        tierUpgrade = { customerId, newTier };
      }
    }

    if (voucher) {
      // redeemed_invoice_id links this redemption back to the invoice that consumed it, so a
      // full refund of this invoice (in refundService.js) can look the voucher up and restore it.
      db.prepare('UPDATE vouchers SET redeemed_at = ?, redeemed_invoice_id = ? WHERE id = ?')
        .run(now.toISOString(), invoiceId, voucher.id);
    }

    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  });

  const invoice = tx();

  if (tierUpgrade) {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(tierUpgrade.customerId);
    notifyTierUpgrade(db, customer, tierUpgrade.newTier);
  }

  return invoice;
}

module.exports = { createInvoice };
