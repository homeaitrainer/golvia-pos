// The spreadsheet's product_name is a marketplace SEO title -- 100+ characters that wrap to three
// or four lines in a cart or on a receipt. They follow a consistent shape:
//
//   GOLVIA JEWELLERY [*] [(37.0g)] <the actual product name> | <shared marketing tail>
//
// so the counter-friendly name is everything before the first "|", minus the brand prefix. The
// gram weight in parentheses is deliberately KEPT: for jewellery it is real product identity
// (a 54g bracelet is a different item from a 19g one), not marketing filler.
//
// Brand casing varies in the source data ("GOLVIA JEWELLERY" / "GOLVIA Jewellery") and some rows
// carry doubled spaces, so the match is case-insensitive and whitespace is collapsed. If stripping
// leaves nothing behind, the full name is used rather than an empty label.
function deriveShortName(fullName) {
  if (!fullName) return '';
  const short = String(fullName)
    .split('|')[0]
    .replace(/^\s*GOLVIA\s+JEWELLERY\s*/i, '')
    .replace(/^\s*\*\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return short || String(fullName).trim();
}

function parseStockRows(rows) {
  const byName = new Map();
  for (const row of rows) {
    const name = row.product_name;
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        short_name: deriveShortName(name),
        category: String(row.category || '').replace(/\s*\(\d+\)\s*$/, '').trim(),
        brand: row.brand || '',
        description: row.product_description || '',
        image_url: row.main_image || '',
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
    INSERT INTO products (name, short_name, category, description, brand, image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO product_variants (product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const p of groupedProducts) {
      const result = insertProduct.run(
        p.name,
        p.short_name || deriveShortName(p.name),
        p.category,
        p.description,
        p.brand,
        p.image_url || null,
      );
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

module.exports = { parseStockRows, importIntoDb, deriveShortName };
