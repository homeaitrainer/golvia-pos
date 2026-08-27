const { calculateTier } = require('./tierEngine');

function createRefund(db, params, now = new Date()) {
  const { invoiceId, lines, paymentMethod } = params;

  const tx = db.transaction(() => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) throw new Error('INVOICE_NOT_FOUND');

    // Value-based proration: each line's share of the invoice's line-value total (unit_price *
    // quantity - item_discount, i.e. value after its OWN item discount, before lump-sum/coins)
    // determines its share of invoice.total -- which already has the lump-sum discount and coin
    // redemption baked in -- rather than a raw returned-quantity / total-quantity count.
    const allInvoiceItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);
    const invoiceLineValueTotal = allInvoiceItems.reduce(
      (sum, i) => sum + (i.unit_price * i.quantity - i.item_discount), 0
    );

    let returnedLineValue = 0;
    let coinsToReverse = 0;
    let coinsToReturn = 0;

    const insertRefund = db.prepare(`
      INSERT INTO refunds (invoice_id, refund_amount, coins_reversed, payment_method, created_at)
      VALUES (?, 0, 0, ?, ?)
    `);
    const refundResult = insertRefund.run(invoiceId, paymentMethod, now.toISOString());
    const refundId = refundResult.lastInsertRowid;

    const insertRefundItem = db.prepare(`
      INSERT INTO refund_items (refund_id, invoice_item_id, quantity) VALUES (?, ?, ?)
    `);
    const restockVariant = db.prepare('UPDATE product_variants SET quantity = quantity + ? WHERE id = ?');

    for (const line of lines) {
      const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(line.invoiceItemId);
      // Prorate this invoice_item's item_discount by the fraction of its quantity being
      // returned (reduces to the full item_discount when the whole line is returned).
      const lineDiscountShare = invoiceItem.item_discount * (line.quantity / invoiceItem.quantity);
      returnedLineValue += invoiceItem.unit_price * line.quantity - lineDiscountShare;

      insertRefundItem.run(refundId, line.invoiceItemId, line.quantity);
      if (invoiceItem.variant_id != null) {
        restockVariant.run(line.quantity, invoiceItem.variant_id);
      }
    }

    const valueRatio = invoiceLineValueTotal > 0 ? returnedLineValue / invoiceLineValueTotal : 0;
    // Prorating the actual amount collected (invoice.total, which already reflects the
    // lump-sum discount and any coin redemption) means a full return refunds exactly
    // invoice.total and a partial return refunds its proportional share.
    const refundAmount = invoice.total * valueRatio;

    // Reverse coins_earned and return coins_redeemed proportionally to the same value-based
    // ratio used for the refund amount above.
    if (invoice.customer_id && (invoice.coins_earned > 0 || invoice.coins_redeemed > 0)) {
      coinsToReverse = Math.round(invoice.coins_earned * valueRatio);
      coinsToReturn = Math.round((invoice.coins_redeemed || 0) * valueRatio);

      const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(invoice.customer_id);
      const newLifetime = Math.max(0, account.lifetime_coins - coinsToReverse);
      // Redeemed coins were never part of lifetime_coins, so returning them only restores
      // current_coin_balance -- it does not affect lifetime_coins or tier.
      const newBalance = Math.max(0, account.current_coin_balance - coinsToReverse + coinsToReturn);
      const newTier = calculateTier(newLifetime);
      db.prepare(`
        UPDATE membership_accounts SET lifetime_coins = ?, current_coin_balance = ?, tier = ?, tier_updated_at = ?
        WHERE customer_id = ?
      `).run(newLifetime, newBalance, newTier, now.toISOString(), invoice.customer_id);
    }

    db.prepare('UPDATE refunds SET refund_amount = ?, coins_reversed = ? WHERE id = ?')
      .run(refundAmount, coinsToReverse, refundId);

    // Determine full vs partial: sum all refunded quantities across all refunds for this invoice
    const allItems = db.prepare('SELECT id, quantity FROM invoice_items WHERE invoice_id = ?').all(invoiceId);
    const totalOriginalQty = allItems.reduce((s, i) => s + i.quantity, 0);
    const totalRefundedQty = db.prepare(`
      SELECT COALESCE(SUM(ri.quantity), 0) as total FROM refund_items ri
      JOIN invoice_items ii ON ii.id = ri.invoice_item_id
      WHERE ii.invoice_id = ?
    `).get(invoiceId).total;

    const newStatus = totalRefundedQty >= totalOriginalQty ? 'refunded' : 'partially-refunded';
    db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(newStatus, invoiceId);

    return db.prepare('SELECT * FROM refunds WHERE id = ?').get(refundId);
  });

  return tx();
}

module.exports = { createRefund };
