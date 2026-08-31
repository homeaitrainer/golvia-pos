// Clears everything produced by testing so the shop opens on a clean set of books, while keeping
// the things that took work to set up: the product catalogue (prices, barcodes, images, display
// names), the admin login, and the Gmail settings.
//
// This is the most destructive operation in the app, so it is a DRY RUN unless --confirm is
// passed, and it always takes a backup of the database before touching anything.
const path = require('path');
const { runBackup } = require('./backupService');

// Ordered so a row is never deleted while another row still references it -- foreign keys are ON
// (see db.js), so the reverse order fails outright rather than silently leaving orphans.
const TABLES_TO_CLEAR = [
  'refund_items',        // -> refunds, invoice_items
  'refunds',             // -> invoices
  'invoice_items',       // -> invoices, product_variants
  'vouchers',            // -> customers, invoices (redeemed_invoice_id)
  'invoices',            // -> customers
  'message_log',         // -> customers
  'membership_accounts',  // -> customers
  'customers',
  'stock_adjustments',   // -> product_variants
];

const TABLES_KEPT = ['products', 'product_variants', 'admin_users', 'settings'];

function countRows(db, table) {
  return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
}

function summarise(db) {
  const willClear = {};
  for (const table of TABLES_TO_CLEAR) willClear[table] = countRows(db, table);
  const willKeep = {};
  for (const table of TABLES_KEPT) willKeep[table] = countRows(db, table);
  return { willClear, willKeep };
}

/**
 * @param stockByVariantSku  optional Map of sku -> opening quantity. Test sales decremented stock,
 *                           so unless it is restored the shop opens short by whatever was rung up
 *                           during testing. Restoring here is safe in a way that a routine
 *                           re-import is not: every sale that moved those numbers is being deleted
 *                           in the same operation.
 */
function resetForGoLive(db, { stockByVariantSku = null } = {}) {
  const before = summarise(db);
  let variantsRestocked = 0;

  const tx = db.transaction(() => {
    for (const table of TABLES_TO_CLEAR) {
      db.prepare(`DELETE FROM ${table}`).run();
    }

    if (stockByVariantSku) {
      const update = db.prepare('UPDATE product_variants SET quantity = ? WHERE sku = ?');
      for (const [sku, quantity] of stockByVariantSku) {
        variantsRestocked += update.run(quantity, sku).changes;
      }
    }
  });
  tx();

  return { cleared: before.willClear, kept: before.willKeep, variantsRestocked };
}

// CLI: node src/services/resetForGoLive.js [--confirm] [--keep-stock]
if (require.main === module) {
  const fs = require('fs');
  const { getDb } = require('../db/db');
  const { parseStockRows, findStockFileNearby } = require('./importStock');

  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm');
  const keepStock = args.includes('--keep-stock');
  const db = getDb();

  const { willClear, willKeep } = summarise(db);

  console.log('This will PERMANENTLY DELETE:');
  for (const [table, count] of Object.entries(willClear)) {
    console.log(`  ${String(count).padStart(5)}  ${table}`);
  }
  console.log('\nThis will KEEP:');
  for (const [table, count] of Object.entries(willKeep)) {
    console.log(`  ${String(count).padStart(5)}  ${table}`);
  }
  console.log(keepStock
    ? '\nStock quantities: left exactly as they are (--keep-stock).'
    : '\nStock quantities: reset to the spreadsheet\'s opening figures, since the sales that'
      + '\n  reduced them are being deleted. Pass --keep-stock to leave them alone.');

  if (!confirmed) {
    console.log('\n--- DRY RUN, nothing has been changed ---');
    console.log('Re-run with --confirm to actually do it:');
    console.log('  node src/services/resetForGoLive.js --confirm');
    process.exit(0);
  }

  // Snapshot first. Everything above is irreversible, and a shop that resets a day early has no
  // other way back.
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
  const backupPath = runBackup(path.join(dataDir, 'golvia.db'), path.join(dataDir, 'backups'));
  console.log(`\nBacked up the current database to:\n  ${backupPath}`);

  let stockByVariantSku = null;
  if (!keepStock) {
    const candidates = findStockFileNearby();
    if (candidates.length !== 1) {
      console.error('\nCannot restore opening stock: expected exactly one spreadsheet nearby, found '
        + candidates.length + '.');
      console.error('Re-run with --keep-stock, or tidy up so only one .xlsx is present.');
      process.exit(1);
    }
    const xlsx = require('xlsx');
    const workbook = xlsx.readFile(candidates[0]);
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    stockByVariantSku = new Map();
    for (const product of parseStockRows(rows)) {
      for (const variant of product.variants) {
        if (variant.sku) stockByVariantSku.set(variant.sku, variant.quantity);
      }
    }
    console.log(`Opening stock will come from:\n  ${candidates[0]}`);
  }

  const result = resetForGoLive(db, { stockByVariantSku });

  console.log('\nDone. The shop is ready to open.');
  const totalCleared = Object.values(result.cleared).reduce((a, b) => a + b, 0);
  console.log(`  ${totalCleared} test rows removed`);
  if (!keepStock) console.log(`  ${result.variantsRestocked} variants reset to opening stock`);
  console.log('  Next sale will be INV-' + new Date().getFullYear() + '-0001');
  if (fs.existsSync(backupPath)) console.log(`  Undo: restore ${path.basename(backupPath)} over data/golvia.db`);
}

module.exports = { resetForGoLive, summarise, TABLES_TO_CLEAR, TABLES_KEPT };
