const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

async function setup() {
  const tmp = path.join(__dirname, `tmp-products-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  return { agent, db, tmp };
}

test('create product with a variant, then look it up by SKU', async () => {
  const { agent, db, tmp } = await setup();

  const create = await agent.post('/api/products').send({
    name: 'Cincin Eksklusif', category: 'Rings', brand: 'GOLVIA',
    variants: [{ variant_label: '40g', sku: 'CINCIN-40', cost_price: 40, sell_price: 120, quantity: 10 }],
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.variants.length, 1);

  const lookup = await agent.get('/api/products/lookup?sku=CINCIN-40');
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.variant.sku, 'CINCIN-40');
  assert.equal(lookup.body.product.name, 'Cincin Eksklusif');

  db.close(); fs.unlinkSync(tmp);
});

test('lookup returns 404 for unknown SKU', async () => {
  const { agent, db, tmp } = await setup();
  const res = await agent.get('/api/products/lookup?sku=NOPE');
  assert.equal(res.status, 404);
  db.close(); fs.unlinkSync(tmp);
});

test('adjust-stock requires a reason and updates quantity', async () => {
  const { agent, db, tmp } = await setup();
  const create = await agent.post('/api/products').send({
    name: 'Bangle', variants: [{ variant_label: '30g', sku: 'BANG-30', cost_price: 30, sell_price: 90, quantity: 5 }],
  });
  const variantId = create.body.variants[0].id;
  const productId = create.body.id;

  const noReason = await agent.post(`/api/products/${productId}/variants/${variantId}/adjust-stock`).send({ delta: 3 });
  assert.equal(noReason.status, 400);

  const ok = await agent.post(`/api/products/${productId}/variants/${variantId}/adjust-stock`).send({ delta: 3, reason: 'Restock' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.quantity, 8);

  db.close(); fs.unlinkSync(tmp);
});

test('search filters by name, category, or sku', async () => {
  const { agent, db, tmp } = await setup();
  await agent.post('/api/products').send({ name: 'Gold Necklace', category: 'Necklaces', variants: [{ variant_label: '20g', sku: 'NECK-20', cost_price: 50, sell_price: 150, quantity: 4 }] });
  const res = await agent.get('/api/products?search=NECK-20');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  db.close(); fs.unlinkSync(tmp);
});

test('PUT /products/:id with a variants array updates cost_price/sell_price but never quantity', async () => {
  const { agent, db, tmp } = await setup();
  const create = await agent.post('/api/products').send({
    name: 'Bracelet', category: 'Bracelets', brand: 'GOLVIA',
    variants: [{ variant_label: '25g', sku: 'BRAC-25', cost_price: 80, sell_price: 200, quantity: 6 }],
  });
  assert.equal(create.status, 201);
  const productId = create.body.id;
  const variantId = create.body.variants[0].id;

  const update = await agent.put(`/api/products/${productId}`).send({
    name: 'Bracelet', category: 'Bracelets', brand: 'GOLVIA', description: 'Updated',
    variants: [{ id: variantId, cost_price: 90, sell_price: 250, quantity: 999 }],
  });
  assert.equal(update.status, 200);
  const updatedVariant = update.body.variants.find(v => v.id === variantId);
  assert.equal(updatedVariant.cost_price, 90);
  assert.equal(updatedVariant.sell_price, 250);
  // quantity must be untouched by this route even though the client sent 999 -- it is not a
  // recognized field for this update path, and only adjust-stock may change quantity.
  assert.equal(updatedVariant.quantity, 6);

  db.close(); fs.unlinkSync(tmp);
});

test('adjust-stock writes a stock_adjustments audit row with the correct variant_id/delta/reason', async () => {
  const { agent, db, tmp } = await setup();
  const create = await agent.post('/api/products').send({
    name: 'Earrings', variants: [{ variant_label: '10g', sku: 'EAR-10', cost_price: 20, sell_price: 60, quantity: 5 }],
  });
  const variantId = create.body.variants[0].id;
  const productId = create.body.id;

  const res = await agent.post(`/api/products/${productId}/variants/${variantId}/adjust-stock`).send({ delta: -2, reason: 'Damaged in store' });
  assert.equal(res.status, 200);
  assert.equal(res.body.quantity, 3);

  const rows = db.prepare('SELECT * FROM stock_adjustments WHERE variant_id = ?').all(variantId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].delta, -2);
  assert.equal(rows[0].reason, 'Damaged in store');

  db.close(); fs.unlinkSync(tmp);
});

test('lookup finds a variant by barcode, and matching tolerates case and stray whitespace', async () => {
  const { agent, db, tmp } = await setup();
  const create = await agent.post('/api/products').send({
    name: 'Scan Test Ring',
    variants: [{ variant_label: '40g', sku: 'CINCIN-aurora 0040', barcode: '9556123456789', cost_price: 4, sell_price: 40, quantity: 10 }],
  });
  assert.equal(create.status, 201);

  // A scanner reads the printed barcode, not the marketplace SKU.
  const byBarcode = await agent.get('/api/products/lookup?sku=9556123456789');
  assert.equal(byBarcode.status, 200);
  assert.equal(byBarcode.body.variant.barcode, '9556123456789');

  // Scanners can emit surrounding whitespace.
  const padded = await agent.get(`/api/products/lookup?sku=${encodeURIComponent('  9556123456789 ')}`);
  assert.equal(padded.status, 200);

  // A hand-typed SKU won't reproduce the source data's mixed casing.
  const bySkuDifferentCase = await agent.get(`/api/products/lookup?sku=${encodeURIComponent('cincin-AURORA 0040')}`);
  assert.equal(bySkuDifferentCase.status, 200);
  assert.equal(bySkuDifferentCase.body.variant.sku, 'CINCIN-aurora 0040');

  const missing = await agent.get('/api/products/lookup?sku=0000000000000');
  assert.equal(missing.status, 404);

  // An empty scan must not match the first variant that happens to have a blank barcode.
  const blank = await agent.get('/api/products/lookup?sku=');
  assert.equal(blank.status, 404);

  db.close(); fs.unlinkSync(tmp);
});

test('a variant barcode round-trips through create and update', async () => {
  const { agent, db, tmp } = await setup();
  const create = await agent.post('/api/products').send({
    name: 'Barcode Round Trip',
    variants: [{ variant_label: 'A', sku: 'RT-1', cost_price: 1, sell_price: 10, quantity: 3 }],
  });
  const productId = create.body.id;
  const variantId = create.body.variants[0].id;
  assert.equal(create.body.variants[0].barcode, null);

  const updated = await agent.put(`/api/products/${productId}`).send({
    name: 'Barcode Round Trip',
    variants: [{ id: variantId, cost_price: 1, sell_price: 10, barcode: '4901234567894' }],
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.variants[0].barcode, '4901234567894');
  // The assigned barcode is immediately scannable.
  const scanned = await agent.get('/api/products/lookup?sku=4901234567894');
  assert.equal(scanned.status, 200);
  assert.equal(scanned.body.variant.id, variantId);

  db.close(); fs.unlinkSync(tmp);
});
