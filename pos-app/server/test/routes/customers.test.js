const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

async function setup() {
  const tmp = path.join(__dirname, `tmp-customers-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  return { agent, db, tmp };
}

test('creating a customer also creates a membership account defaulting to White tier', async () => {
  const { agent, db, tmp } = await setup();
  const res = await agent.post('/api/customers').send({ name: 'Alice', phone: '0123456789', email: 'a@example.com', whatsapp_consent: true });
  assert.equal(res.status, 201);
  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(res.body.id);
  assert.equal(account.tier, 'White');
  assert.equal(account.lifetime_coins, 0);
  db.close(); fs.unlinkSync(tmp);
});

test('rejects duplicate phone number', async () => {
  const { agent, db, tmp } = await setup();
  await agent.post('/api/customers').send({ name: 'Alice', phone: '0123456789' });
  const dup = await agent.post('/api/customers').send({ name: 'Bob', phone: '0123456789' });
  assert.equal(dup.status, 409);
  db.close(); fs.unlinkSync(tmp);
});

test('lookup by phone finds the customer with membership info', async () => {
  const { agent, db, tmp } = await setup();
  await agent.post('/api/customers').send({ name: 'Alice', phone: '0123456789' });
  const res = await agent.get('/api/customers/by-phone/0123456789');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Alice');
  assert.equal(res.body.membership.tier, 'White');
  db.close(); fs.unlinkSync(tmp);
});
