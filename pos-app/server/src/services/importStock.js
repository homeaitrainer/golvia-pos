function parseStockRows(rows) {
  const byName = new Map();
  for (const row of rows) {
    const name = row.product_name;
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        category: String(row.category || '').replace(/\s*\(\d+\)\s*$/, '').trim(),
        brand: row.brand || '',
        description: row.product_description || '',
        variants: [],
      });
    }
    byName.get(name).variants.push({
      variant_label: row.variation_value || '',
      sku: row.seller_sku || '',
      cost_price: Number(row.Cost) || 0,
      sell_price: Number(row.price) || 0,
      quantity: Number(row.quantity) || 0,
    });
  }
  return Array.from(byName.values());
}

function importIntoDb(db, groupedProducts) {
  let productsCreated = 0;
  let variantsCreated = 0;
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, description, brand) VALUES (?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO product_variants (product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const p of groupedProducts) {
      const result = insertProduct.run(p.name, p.category, p.description, p.brand);
      productsCreated++;
      for (const v of p.variants) {
        insertVariant.run(result.lastInsertRowid, v.variant_label, v.sku, v.cost_price, v.sell_price, v.quantity);
        variantsCreated++;
      }
    }
  });
  tx();
  return { productsCreated, variantsCreated };
}

// CLI entry point: node src/services/importStock.js <path-to-xlsx>
if (require.main === module) {
  const xlsx = require('xlsx');
  const { getDb } = require('../db/db');
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node importStock.js <path-to-xlsx>');
    process.exit(1);
  }
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);
  const grouped = parseStockRows(rows);
  const db = getDb();
  const result = importIntoDb(db, grouped);
  console.log(`Imported ${result.productsCreated} products, ${result.variantsCreated} variants.`);
}

module.exports = { parseStockRows, importIntoDb };
