const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { createInvoice } = require('../services/checkoutService');
const { createRefund } = require('../services/refundService');

function invoicesRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', (req, res) => {
    const { customerId, items, lumpSumDiscount, coinsToRedeem, paymentMethod } = req.body;
    try {
      const invoice = createInvoice(db, { customerId, items, lumpSumDiscount, coinsToRedeem, paymentMethod });
      res.status(201).json(invoice);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_STOCK' || err.message === 'INSUFFICIENT_COINS') {
        return res.status(409).json({ error: err.message });
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
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'NOT_FOUND' });
    const items = db.prepare(`
      SELECT ii.*, p.name as product_name, pv.variant_label
      FROM invoice_items ii
      JOIN product_variants pv ON pv.id = ii.variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE ii.invoice_id = ?
    `).all(req.params.id);
    const customer = invoice.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id) : null;
    res.json({ ...invoice, items, customer });
  });

  router.post('/:id/refund', (req, res) => {
    const { lines, paymentMethod } = req.body;
    try {
      const refund = createRefund(db, { invoiceId: req.params.id, lines, paymentMethod });
      res.status(201).json(refund);
    } catch (err) {
      if (err.message === 'INVOICE_NOT_FOUND') return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  return router;
}

module.exports = { invoicesRouter };
