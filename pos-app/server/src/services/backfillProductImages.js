const { parseStockRows } = require('./importStock');

function backfillImageUrls(db, groupedProducts) {
  let updated = 0;
  const updateStmt = db.prepare(`
    UPDATE products SET image_url = ? WHERE name = ? AND (image_url IS NULL OR image_url = '')
  `);
  for (const p of groupedProducts) {
    if (!p.image_url) continue;
    const result = updateStmt.run(p.image_url, p.name);
    updated += result.changes;
  }
  return { updated };
}

// CLI entry point: node src/services/backfillProductImages.js <path-to-xlsx>
if (require.main === module) {
  const xlsx = require('xlsx');
  const { getDb } = require('../db/db');
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node backfillProductImages.js <path-to-xlsx>');
    process.exit(1);
  }
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);
  const grouped = parseStockRows(rows);
  const db = getDb();
  const result = backfillImageUrls(db, grouped);
  console.log(`Backfilled image_url on ${result.updated} product(s).`);
}

module.exports = { backfillImageUrls };
