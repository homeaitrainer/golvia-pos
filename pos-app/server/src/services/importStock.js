const fs = require('fs');
const path = require('path');

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

// Re-runnable. The first version only ever INSERTed, so running it a second time -- which the
// setup instructions invite, and which anyone updating their spreadsheet would naturally try --
// died on `UNIQUE constraint failed: product_variants.sku`. Products are matched on `name` and
// variants on `sku` (both already unique in practice), so a repeat run updates instead of
// duplicating.
//
// `quantity` is deliberately NOT updated by default. Stock in the database is the live figure --
// decremented by every sale and by audited stock adjustments -- while the spreadsheet holds
// whatever was true when it was exported. Overwriting live stock with a stale snapshot would
// silently undo every sale since, and the till would then happily oversell. Pass
// `{ resetQuantities: true }` to deliberately treat the spreadsheet as a stock-take.
//
// short_name is only filled when empty, so a name edited in the product screen survives a re-import.
function importIntoDb(db, groupedProducts, { resetQuantities = false } = {}) {
  let productsCreated = 0;
  let productsUpdated = 0;
  let variantsCreated = 0;
  let variantsUpdated = 0;

  const findProduct = db.prepare('SELECT id, short_name FROM products WHERE name = ?');
  const insertProduct = db.prepare(`
    INSERT INTO products (name, short_name, category, description, brand, image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updateProduct = db.prepare(`
    UPDATE products SET category = ?, description = ?, brand = ?, image_url = COALESCE(?, image_url)
    WHERE id = ?
  `);
  const setShortName = db.prepare('UPDATE products SET short_name = ? WHERE id = ?');

  const findVariant = db.prepare('SELECT id FROM product_variants WHERE sku = ?');
  const insertVariant = db.prepare(`
    INSERT INTO product_variants (product_id, variant_label, sku, cost_price, sell_price, quantity)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updateVariant = db.prepare(`
    UPDATE product_variants SET product_id = ?, variant_label = ?, cost_price = ?, sell_price = ?
    WHERE id = ?
  `);
  const updateVariantWithQuantity = db.prepare(`
    UPDATE product_variants SET product_id = ?, variant_label = ?, cost_price = ?, sell_price = ?, quantity = ?
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    for (const p of groupedProducts) {
      const shortName = p.short_name || deriveShortName(p.name);
      let productId;

      const existingProduct = findProduct.get(p.name);
      if (existingProduct) {
        productId = existingProduct.id;
        updateProduct.run(p.category, p.description, p.brand, p.image_url || null, productId);
        if (!existingProduct.short_name) setShortName.run(shortName, productId);
        productsUpdated++;
      } else {
        productId = insertProduct.run(
          p.name, shortName, p.category, p.description, p.brand, p.image_url || null,
        ).lastInsertRowid;
        productsCreated++;
      }

      for (const v of p.variants) {
        const existingVariant = v.sku ? findVariant.get(v.sku) : null;
        if (existingVariant) {
          if (resetQuantities) {
            updateVariantWithQuantity.run(productId, v.variant_label, v.cost_price, v.sell_price, v.quantity, existingVariant.id);
          } else {
            updateVariant.run(productId, v.variant_label, v.cost_price, v.sell_price, existingVariant.id);
          }
          variantsUpdated++;
        } else {
          insertVariant.run(productId, v.variant_label, v.sku, v.cost_price, v.sell_price, v.quantity);
          variantsCreated++;
        }
      }
    }
  });
  tx();
  return { productsCreated, productsUpdated, variantsCreated, variantsUpdated };
}

// Looks for the stock spreadsheet in the obvious places so the path can be omitted entirely.
// Typing a full Windows path is the single most error-prone part of setup: documentation has to
// show *some* example, and a placeholder like "D:\path\to\file.xlsx" gets pasted verbatim, which
// then fails with a confusing "file not found" naming a directory that never existed.
function findStockFileNearby() {
  const searchDirs = [
    path.join(__dirname, '../../..'),    // pos-app/
    path.join(__dirname, '../../../..'), // repository root
    process.cwd(),
  ];
  const found = [];
  for (const dir of searchDirs) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const entry of entries) {
      // Skip Excel's lock files (~$...) and anything that isn't a spreadsheet.
      if (!entry.toLowerCase().endsWith('.xlsx') || entry.startsWith('~$')) continue;
      const full = path.resolve(dir, entry);
      if (!found.includes(full)) found.push(full);
    }
  }
  return found;
}

// CLI: node src/services/importStock.js [path-to-xlsx] [--reset-quantities]
if (require.main === module) {
  const xlsx = require('xlsx');
  const { getDb } = require('../db/db');

  const args = process.argv.slice(2);
  const resetQuantities = args.includes('--reset-quantities');
  // Strip surrounding angle brackets/quotes: documentation renders the argument as a placeholder,
  // and pasting the brackets along with the path is an easy mistake.
  let filePath = (args.find(a => !a.startsWith('--')) || '').replace(/^[<"']+|[>"']+$/g, '');

  if (!filePath) {
    const candidates = findStockFileNearby();
    if (candidates.length === 1) {
      filePath = candidates[0];
      console.log(`Using ${filePath}`);
    } else if (candidates.length === 0) {
      console.error('No .xlsx file found next to the app, and no path was given.');
      console.error('');
      console.error('Usage: node src/services/importStock.js [path-to-xlsx] [--reset-quantities]');
      console.error('Pass the full path to your stock file, in quotes if it contains spaces.');
      process.exit(1);
    } else {
      console.error('Found more than one spreadsheet — say which one you mean:');
      for (const candidate of candidates) console.error(`  ${candidate}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Could not find that file:\n  ${filePath}`);
    const candidates = findStockFileNearby();
    if (candidates.length > 0) {
      console.error('\nDid you mean one of these? (or just run the command with no path at all)');
      for (const candidate of candidates) console.error(`  ${candidate}`);
    }
    process.exit(1);
  }

  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);
  const grouped = parseStockRows(rows);
  const db = getDb();
  const result = importIntoDb(db, grouped, { resetQuantities });

  console.log(`Products : ${result.productsCreated} added, ${result.productsUpdated} updated`);
  console.log(`Variants : ${result.variantsCreated} added, ${result.variantsUpdated} updated`);
  console.log(resetQuantities
    ? 'Stock quantities were OVERWRITTEN from the spreadsheet (--reset-quantities).'
    : 'Stock quantities left untouched. Use --reset-quantities to overwrite them from the spreadsheet.');
}

module.exports = { parseStockRows, importIntoDb, deriveShortName };
