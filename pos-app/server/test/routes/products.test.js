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
