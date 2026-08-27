const { calculateTier } = require('./tierEngine');

function createRefund(db, params, now = new Date()) {
  const { invoiceId, lines, paymentMethod } = params;

  const tx = db.transaction(() => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) throw new Error('INVOICE_NOT_FOUND');

    let refundAmount = 0;
    let coinsToReverse = 0;

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
      const unitNet = invoiceItem.unit_price - (invoiceItem.item_discount / invoiceItem.quantity);
      const lineRefundAmount = unitNet * line.quantity;
      refundAmount += lineRefundAmount;

      insertRefundItem.run(refundId, line.invoiceItemId, line.quantity);
      if (invoiceItem.variant_id != null) {
        restockVariant.run(line.quantity, invoiceItem.variant_id);
      }
    }

    // Reverse coins proportionally to (returned qty / total invoice qty) across the whole invoice
    if (invoice.customer_id && invoice.coins_earned > 0) {
      const allItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);
      const totalQty = allItems.reduce((s, i) => s + i.quantity, 0);
      const returnedQty = lines.reduce((s, l) => s + l.quantity, 0);
      coinsToReverse = Math.round(invoice.coins_earned * (returnedQty / totalQty));

      const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(invoice.customer_id);
      const newLifetime = Math.max(0, account.lifetime_coins - coinsToReverse);
      const newBalance = Math.max(0, account.current_coin_balance - coinsToReverse);
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
