const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { createInvoice } = require('../services/checkoutService');
const { createRefund } = require('../services/refundService');
const { sendEmail } = require('../services/emailService');

function getInvoiceWithDetails(db, invoiceId) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;
  const items = db.prepare(`
    SELECT ii.*,
           COALESCE(NULLIF(p.short_name, ''), p.name, 'Deleted product') as product_name,
           COALESCE(pv.variant_label, 'N/A') as variant_label
    FROM invoice_items ii
    LEFT JOIN product_variants pv ON pv.id = ii.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE ii.invoice_id = ?
  `).all(invoiceId);
  const customer = invoice.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id) : null;
  const membership = customer ? db.prepare('SELECT tier FROM membership_accounts WHERE customer_id = ?').get(customer.id) : null;
  return { ...invoice, items, customer: customer ? { ...customer, tier: membership ? membership.tier : null } : null };
}

function buildReceiptHtml(invoice) {
  const rows = invoice.items.map(item => `
    <tr>
      <td>${item.product_name}${item.variant_label && item.variant_label !== 'N/A' ? ` (${item.variant_label})` : ''}</td>
      <td>${item.quantity}</td>
      <td>${item.unit_price.toFixed(2)}</td>
    </tr>
  `).join('');
  return `
    <p>Thank you for shopping at GOLVIA Jewellery.</p>
    <p><strong>Invoice:</strong> ${invoice.invoice_number}<br/>
    <strong>Date:</strong> ${invoice.created_at}<br/>
    <strong>Payment method:</strong> ${invoice.payment_method}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
      <thead>
        <tr><th>Item</th><th>Qty</th><th>Unit Price (RM)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Discount total: RM${invoice.discount_total.toFixed(2)}<br/>
    <strong>Total: RM${invoice.total.toFixed(2)}</strong></p>
  `;
}

function invoicesRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', (req, res) => {
    const { customerId, items, lumpSumDiscount, coinsToRedeem, paymentMethod, voucherId } = req.body;
    try {
      const invoice = createInvoice(db, { customerId, items, lumpSumDiscount, coinsToRedeem, paymentMethod, voucherId });
      res.status(201).json(invoice);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_STOCK' || err.message === 'INSUFFICIENT_COINS' || err.message === 'INVALID_VOUCHER' || err.message === 'VOUCHER_NO_VALUE') {
        return res.status(409).json({ error: err.message });
      }
      if (err.message === 'INVALID_ITEM_QUANTITY') {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  });

  router.get('/', (req, res) => {
    const { search } = req.query;
    let rows;
    if (search) {
      rows = db.prepare('SELECT * FROM invoices WHERE invoice_number LIKE ? ORDER BY created_at DESC').all(`%${search}%`);
    } else {
      rows = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC').all();
    }
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const invoice = getInvoiceWithDetails(db, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(invoice);
  });

  router.post('/:id/email-receipt', async (req, res) => {
    const invoice = getInvoiceWithDetails(db, req.params.id);
    if (!invoice) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!invoice.customer || !invoice.customer.email) {
      return res.status(400).json({ error: 'NO_CUSTOMER_EMAIL' });
    }

    try {
      await sendEmail(db, {
        to: invoice.customer.email,
        subject: `Your GOLVIA Receipt ${invoice.invoice_number}`,
        html: buildReceiptHtml(invoice),
      });
    } catch (err) {
      return res.status(502).json({ error: 'EMAIL_SEND_FAILED' });
    }

    db.prepare(`
      INSERT INTO message_log (customer_id, channel, trigger_type) VALUES (?, 'email', 'receipt')
    `).run(invoice.customer.id);

    res.json({ ok: true });
  });

  router.post('/:id/refund', (req, res) => {
    const { lines, paymentMethod } = req.body;
    try {
      const refund = createRefund(db, { invoiceId: req.params.id, lines, paymentMethod });
      res.status(201).json(refund);
    } catch (err) {
      if (err.message === 'INVOICE_NOT_FOUND' || err.message === 'INVOICE_ITEM_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message === 'INVALID_REFUND_LINES') {
        return res.status(400).json({ error: err.message });
      }
      if (err.message === 'REFUND_QUANTITY_EXCEEDS_REMAINING') {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  });

  return router;
}

module.exports = { invoicesRouter };
