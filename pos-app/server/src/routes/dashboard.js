const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

function dashboardRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/summary', (req, res) => {
    const todayRow = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
      FROM invoices WHERE date(created_at) = date('now') AND status != 'refunded'
    `).get();
    const lowStockVariants = db.prepare(`
      SELECT pv.*, p.name as product_name FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.quantity <= pv.low_stock_threshold
    `).all();
    const upcomingBirthdays = db.prepare(`
      SELECT * FROM customers WHERE birthday IS NOT NULL AND strftime('%m-%d', birthday) = strftime('%m-%d', 'now')
    `).all();

    res.json({
      todaySalesTotal: todayRow.total,
      todayTransactionCount: todayRow.count,
      lowStockVariants,
      upcomingBirthdays,
    });
  });

  return router;
}

module.exports = { dashboardRouter };
