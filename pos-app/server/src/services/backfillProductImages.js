const { parseStockRows, deriveShortName } = require('./importStock');

// Unlike the image backfill, this needs no spreadsheet: short_name is derived from the product's
// own `name`, which is already in the database. Only fills rows that have no short_name yet, so
// it is safe to re-run and never clobbers a name the shop has edited by hand.
function backfillShortNames(db) {
  let updated = 0;
  const products = db.prepare(`
    SELECT id, name FROM products WHERE short_name IS NULL OR short_name = ''
  `).all();
  const updateStmt = db.prepare('UPDATE products SET short_name = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const product of products) {
      const shortName = deriveShortName(product.name);
      if (!shortName) continue;
      updated += updateStmt.run(shortName, product.id).changes;
    }
  });
  tx();
  return { updated };
}

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
  const imageResult = backfillImageUrls(db, grouped);
  console.log(`Backfilled image_url on ${imageResult.updated} product(s).`);
  const shortNameResult = backfillShortNames(db);
  console.log(`Backfilled short_name on ${shortNameResult.updated} product(s).`);
}

module.exports = { backfillImageUrls, backfillShortNames };
