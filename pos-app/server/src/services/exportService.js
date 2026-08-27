function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

function exportAllToCsv(db) {
  const products = db.prepare(`
    SELECT p.id, p.name, p.category, v.variant_label, v.sku, v.cost_price, v.sell_price, v.quantity
    FROM products p LEFT JOIN product_variants v ON v.product_id = p.id
  `).all();
  const customers = db.prepare('SELECT * FROM customers').all();
  const invoices = db.prepare('SELECT * FROM invoices').all();

  return {
    'products.csv': toCsv(products),
    'customers.csv': toCsv(customers),
    'invoices.csv': toCsv(invoices),
  };
}

module.exports = { exportAllToCsv };
