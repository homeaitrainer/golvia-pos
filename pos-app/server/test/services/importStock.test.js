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
