const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { isBirthdayToday } = require('../services/voucherEngine');

// Local-day boundaries as UTC ISO strings, mirroring the discipline in voucherEngine.js /
// voucherIssuance.js: `created_at` is stored as a UTC ISO string (via `now.toISOString()`), but
// "today" must be computed from LOCAL date components -- this app runs in Malaysia (UTC+8), so
// SQLite's UTC-based date('now')/strftime(..., 'now') disagree with local "today" for the first
// 8 hours of every local day. Converting the local midnight boundaries to their own ISO strings
// lets a plain string range comparison (`created_at >= start AND created_at < end`) work
// correctly against the stored UTC timestamps.
function localDayBoundaries(now) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function dashboardRouter(db, now = () => new Date()) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/summary', (req, res) => {
    const { startIso, endIso } = localDayBoundaries(now());

    // Today's invoice total is no longer filtered by status: a partially/fully refunded
    // invoice still contributes its full original total here, and the refund amount is
    // subtracted separately below -- money that left the drawer today counts against today's
    // total regardless of which invoice (or which day) the refund was originally issued for.
    const todayInvoices = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
      FROM invoices WHERE created_at >= ? AND created_at < ?
    `).get(startIso, endIso);

    const todayRefunds = db.prepare(`
      SELECT COALESCE(SUM(refund_amount), 0) as total
      FROM refunds WHERE created_at >= ? AND created_at < ?
    `).get(startIso, endIso);

    const lowStockVariants = db.prepare(`
      SELECT pv.*, p.name as product_name FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.quantity <= pv.low_stock_threshold
    `).all();

    const customersWithBirthday = db.prepare(`
      SELECT * FROM customers WHERE birthday IS NOT NULL
    `).all();
    const upcomingBirthdays = customersWithBirthday.filter(c => isBirthdayToday(c.birthday, now()));

    res.json({
      todaySalesTotal: todayInvoices.total - todayRefunds.total,
      todayTransactionCount: todayInvoices.count,
      lowStockVariants,
      upcomingBirthdays,
    });
  });

  return router;
}

module.exports = { dashboardRouter };
