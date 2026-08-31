const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { parseStockRows, importIntoDb } = require('../../src/services/importStock');

test('parseStockRows groups rows by product_name into variants', () => {
  const rows = [
    { product_name: 'Cincin Eksklusif Adjustable', category: 'Rings (605273)', brand: 'GOLVIA', variation_value: 'ROSELLE', Cost: 4, price: 40, quantity: 48, seller_sku: 'CINCIN-aurora 0040' },
    { product_name: 'Cincin Eksklusif Adjustable', category: 'Rings (605273)', brand: 'GOLVIA', variation_value: 'AURORA', Cost: 4.5, price: 45, quantity: 73, seller_sku: 'CINCIN-aurora 0045' },
    { product_name: 'Gold Necklace', category: 'Necklaces (605280)', brand: 'GOLVIA', variation_value: '20cm', Cost: 10, price: 100, quantity: 12, seller_sku: 'NECK-20' },
  ];
  const grouped = parseStockRows(rows);
  assert.equal(grouped.length, 2);
  const ring = grouped.find(p => p.name === 'Cincin Eksklusif Adjustable');
  assert.equal(ring.variants.length, 2);
  assert.equal(ring.category, 'Rings');
  assert.equal(ring.variants[0].variant_label, 'ROSELLE');
  assert.equal(ring.variants[0].sku, 'CINCIN-aurora 0040');
  assert.equal(ring.variants[0].cost_price, 4);
  assert.equal(ring.variants[0].sell_price, 40);
  assert.equal(ring.variants[0].quantity, 48);
});

test('importIntoDb inserts products and variants', () => {
  const tmp = path.join(__dirname, `tmp-import-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const grouped = [{ name: 'Test Ring', category: 'Rings', brand: 'GOLVIA', description: '', variants: [
    { variant_label: '40g', sku: 'T-40', cost_price: 4, sell_price: 40, quantity: 10 },
  ] }];
  const result = importIntoDb(db, grouped);
  assert.equal(result.productsCreated, 1);
  assert.equal(result.variantsCreated, 1);
  const products = db.prepare('SELECT * FROM products').all();
  assert.equal(products.length, 1);
  db.close(); fs.unlinkSync(tmp);
});

test('parseStockRows captures main_image as image_url from the first row', () => {
  const rows = [
    { product_name: 'Cincin Eksklusif Adjustable', category: 'Rings (605273)', brand: 'GOLVIA', variation_value: 'ROSELLE', Cost: 4, price: 40, quantity: 48, seller_sku: 'CINCIN-aurora 0040', main_image: 'https://example.com/ring.jpg' },
    { product_name: 'Cincin Eksklusif Adjustable', category: 'Rings (605273)', brand: 'GOLVIA', variation_value: 'AURORA', Cost: 4.5, price: 45, quantity: 73, seller_sku: 'CINCIN-aurora 0045', main_image: 'https://example.com/ring-2.jpg' },
  ];
  const grouped = parseStockRows(rows);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].image_url, 'https://example.com/ring.jpg');
});

test('importIntoDb stores image_url on the product row', () => {
  const tmp = path.join(__dirname, `tmp-import-img-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const grouped = [{ name: 'Test Ring', category: 'Rings', brand: 'GOLVIA', description: '', image_url: 'https://example.com/ring.jpg', variants: [
    { variant_label: '40g', sku: 'T-40', cost_price: 4, sell_price: 40, quantity: 10 },
  ] }];
  importIntoDb(db, grouped);
  const product = db.prepare('SELECT * FROM products').get();
  assert.equal(product.image_url, 'https://example.com/ring.jpg');
  db.close(); fs.unlinkSync(tmp);
});

test('deriveShortName strips the brand prefix and marketing tail, keeping the gram weight', () => {
  const { deriveShortName } = require('../../src/services/importStock');
  assert.equal(
    deriveShortName('GOLVIA JEWELLERY Cincin Eksklusif Adjustable | Korean Style Women Ring Jewellery Daily Wear Accessories & Perfect Gift for Anniversary (A2)'),
    'Cincin Eksklusif Adjustable',
  );
  // Gram weight is real product identity for jewellery, so it is kept.
  assert.equal(
    deriveShortName('GOLVIA JEWELLERY (37.0g) Gelang Lipan Kikir | Korean Style Women Bracelet  Jewellery Daily Wear'),
    '(37.0g) Gelang Lipan Kikir',
  );
  // Leading asterisk and doubled spaces both appear in the real export.
  assert.equal(
    deriveShortName('GOLVIA JEWELLERY  * Gelang Minimalis  | Korean Style Women Bracelet Jewellery'),
    'Gelang Minimalis',
  );
  // Brand casing varies between rows in the source data.
  assert.equal(
    deriveShortName('GOLVIA Jewellery (13.0g) Gold Plated Bracelet Paper Clip Love ACE | Korean Style'),
    '(13.0g) Gold Plated Bracelet Paper Clip Love ACE',
  );
  // No pipe, no brand prefix -- returned as-is.
  assert.equal(deriveShortName('Plain Ring'), 'Plain Ring');
  // Stripping everything would leave an unusable blank label, so fall back to the full name.
  assert.equal(deriveShortName('GOLVIA JEWELLERY | tail only'), 'GOLVIA JEWELLERY | tail only');
  assert.equal(deriveShortName(''), '');
});

test('importIntoDb stores a derived short_name alongside the full name', () => {
  const tmp = path.join(__dirname, `tmp-import-short-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const grouped = parseStockRows([
    { product_name: 'GOLVIA JEWELLERY Bangle Premium | Korean Style Women Bracelet', variation_value: 'A', seller_sku: 'B-1', Cost: 1, price: 10, quantity: 5 },
  ]);
  importIntoDb(db, grouped);
  const product = db.prepare('SELECT name, short_name FROM products').get();
  assert.equal(product.short_name, 'Bangle Premium');
  assert.ok(product.name.startsWith('GOLVIA JEWELLERY'));
  db.close(); fs.unlinkSync(tmp);
});

test('re-importing the same spreadsheet updates instead of failing on duplicate SKUs', () => {
  const tmp = path.join(__dirname, `tmp-reimport-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const rows = [
    { product_name: 'GOLVIA JEWELLERY Bangle Premium | Korean Style', variation_value: 'A', seller_sku: 'B-1', Cost: 10, price: 100, quantity: 5 },
    { product_name: 'GOLVIA JEWELLERY Bangle Premium | Korean Style', variation_value: 'B', seller_sku: 'B-2', Cost: 12, price: 120, quantity: 8 },
  ];

  const first = importIntoDb(db, parseStockRows(rows));
  assert.equal(first.productsCreated, 1);
  assert.equal(first.variantsCreated, 2);

  // This is the exact call that used to throw SQLITE_CONSTRAINT_UNIQUE.
  const second = importIntoDb(db, parseStockRows(rows));
  assert.equal(second.productsCreated, 0);
  assert.equal(second.productsUpdated, 1);
  assert.equal(second.variantsCreated, 0);
  assert.equal(second.variantsUpdated, 2);

  // No duplication.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM products').get().c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM product_variants').get().c, 2);
  db.close(); fs.unlinkSync(tmp);
});

test('re-importing does NOT overwrite live stock, which reflects real sales', () => {
  const tmp = path.join(__dirname, `tmp-reimport-qty-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const rows = [{ product_name: 'Ring', variation_value: 'A', seller_sku: 'R-1', Cost: 10, price: 100, quantity: 50 }];
  importIntoDb(db, parseStockRows(rows));

  // Simulate selling three: live stock is now 47, while the spreadsheet still says 50.
  db.prepare("UPDATE product_variants SET quantity = 47 WHERE sku = 'R-1'").run();

  importIntoDb(db, parseStockRows(rows));
  assert.equal(db.prepare("SELECT quantity FROM product_variants WHERE sku = 'R-1'").get().quantity, 47);

  // Prices still get refreshed even though quantity is protected.
  const repriced = [{ ...rows[0], price: 130 }];
  importIntoDb(db, parseStockRows(repriced));
  const after = db.prepare("SELECT quantity, sell_price FROM product_variants WHERE sku = 'R-1'").get();
  assert.equal(after.sell_price, 130);
  assert.equal(after.quantity, 47);
  db.close(); fs.unlinkSync(tmp);
});

test('--reset-quantities behaviour deliberately overwrites stock from the spreadsheet', () => {
  const tmp = path.join(__dirname, `tmp-reimport-reset-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const rows = [{ product_name: 'Ring', variation_value: 'A', seller_sku: 'R-1', Cost: 10, price: 100, quantity: 50 }];
  importIntoDb(db, parseStockRows(rows));
  db.prepare("UPDATE product_variants SET quantity = 47 WHERE sku = 'R-1'").run();

  importIntoDb(db, parseStockRows(rows), { resetQuantities: true });
  assert.equal(db.prepare("SELECT quantity FROM product_variants WHERE sku = 'R-1'").get().quantity, 50);
  db.close(); fs.unlinkSync(tmp);
});

test('a re-import adds genuinely new variants without disturbing existing ones', () => {
  const tmp = path.join(__dirname, `tmp-reimport-new-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const original = [{ product_name: 'Ring', variation_value: 'A', seller_sku: 'R-1', Cost: 10, price: 100, quantity: 5 }];
  importIntoDb(db, parseStockRows(original));

  const withNewVariant = [
    ...original,
    { product_name: 'Ring', variation_value: 'B', seller_sku: 'R-2', Cost: 11, price: 110, quantity: 9 },
  ];
  const result = importIntoDb(db, parseStockRows(withNewVariant));
  assert.equal(result.variantsCreated, 1);
  assert.equal(result.variantsUpdated, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM product_variants').get().c, 2);
  db.close(); fs.unlinkSync(tmp);
});

test('a re-import does not clobber a short_name edited in the product screen', () => {
  const tmp = path.join(__dirname, `tmp-reimport-shortname-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const rows = [{ product_name: 'GOLVIA JEWELLERY Bangle Premium | Korean Style', variation_value: 'A', seller_sku: 'B-1', Cost: 1, price: 10, quantity: 1 }];
  importIntoDb(db, parseStockRows(rows));

  db.prepare("UPDATE products SET short_name = 'Shop Bangle' WHERE name LIKE 'GOLVIA%'").run();
  importIntoDb(db, parseStockRows(rows));

  assert.equal(db.prepare('SELECT short_name FROM products').get().short_name, 'Shop Bangle');
  db.close(); fs.unlinkSync(tmp);
});
