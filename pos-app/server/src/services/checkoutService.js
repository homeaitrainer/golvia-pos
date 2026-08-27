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
  const { customerId, items, lumpSumDiscount, coinsToRedeem, paymentMethod, voucherId } = params;

  // Populated inside the transaction below (synchronously -- better-sqlite3 transactions run
  // synchronously) when this sale changes the customer's tier, then read after tx() returns to
  // fire the notification outside the transaction -- a slow SMTP call has no business running
  // inside a synchronous DB transaction.
  let tierUpgrade = null;

  const tx = db.transaction(() => {
    // Validate stock
    for (const item of items) {
      const variant = db.prepare('SELECT quantity FROM product_variants WHERE id = ?').get(item.variantId);
      if (!variant || variant.quantity < item.quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }
    }

    let subtotal = 0;
    let itemDiscountTotal = 0;
    for (const item of items) {
      subtotal += item.unitPrice * item.quantity;
      itemDiscountTotal += item.itemDiscount || 0;
    }

    const afterItemDiscounts = subtotal - itemDiscountTotal;
    let lumpSumAmount = 0;
    if (lumpSumDiscount) {
      lumpSumAmount = lumpSumDiscount.type === 'percent'
        ? afterItemDiscounts * (lumpSumDiscount.value / 100)
        : lumpSumDiscount.value;
    }

    // Coins can discount at most what's left after item + lump-sum discounts, so the total
    // never goes negative.
    const remainingAfterDiscounts = afterItemDiscounts - lumpSumAmount;
    const maxRedeemableValue = Math.max(0, remainingAfterDiscounts);

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
    }

    const discountTotal = itemDiscountTotal + lumpSumAmount + voucherDiscountValue;
    const total = subtotal - discountTotal - coinDiscountValue;
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
    for (const item of items) {
      insertItem.run(invoiceId, item.variantId, item.quantity, item.unitPrice, item.itemDiscount || 0);
      decrementStock.run(item.quantity, item.variantId);
    }

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
      db.prepare('UPDATE vouchers SET redeemed_at = ? WHERE id = ?').run(now.toISOString(), voucher.id);
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
