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
// `offsetDays` shifts the window whole local days relative to `now` (0 = today, -1 = yesterday);
// passing it through the Date constructor's day argument handles month and year rollover for
// free. `start` is returned as a Date so callers can format a label from its LOCAL components --
// formatting from toISOString() would re-introduce the very UTC/local drift described above.
function localDayBoundaries(now, offsetDays = 0) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString(), start };
}

function localDateString(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
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
      SELECT pv.*, COALESCE(NULLIF(p.short_name, ''), p.name) as product_name FROM product_variants pv
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

  // Net sales per local day for the last 7 days (oldest first), for the dashboard chart.
  // Same net-of-refunds definition as /summary above: a refund reduces the total for the day
  // the REFUND happened, not the day the original invoice was raised.
  router.get('/sales-trend', (req, res) => {
    const current = now();
    const invoiceStmt = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM invoices WHERE created_at >= ? AND created_at < ?
    `);
    const refundStmt = db.prepare(`
      SELECT COALESCE(SUM(refund_amount), 0) as total
      FROM refunds WHERE created_at >= ? AND created_at < ?
    `);

    const days = [];
    for (let offset = -6; offset <= 0; offset++) {
      const { startIso, endIso, start } = localDayBoundaries(current, offset);
      const invoices = invoiceStmt.get(startIso, endIso);
      const refunds = refundStmt.get(startIso, endIso);
      days.push({ date: localDateString(start), total: invoices.total - refunds.total });
    }

    res.json(days);
  });

  return router;
}

module.exports = { dashboardRouter };
