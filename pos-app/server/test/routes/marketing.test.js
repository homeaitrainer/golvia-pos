const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

test('pending marketing list only includes consented customers with a birthday today', async () => {
  const tmp = path.join(__dirname, `tmp-marketing-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const todayIso = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO customers (id, name, phone, birthday, whatsapp_consent) VALUES (1, 'Alice', '0123456789', ?, 1)`).run(`1990-${todayIso.slice(5)}`);
  db.prepare(`INSERT INTO customers (id, name, phone, birthday, whatsapp_consent) VALUES (2, 'Bob', '0198765432', ?, 0)`).run(`1990-${todayIso.slice(5)}`); // no consent

  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });

  const res = await agent.get('/api/marketing/pending');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, 'Alice');
  assert.ok(res.body[0].whatsappLink.startsWith('https://wa.me/'));

  db.close(); fs.unlinkSync(tmp);
});

test('after marking a trigger as sent for a customer, they no longer appear in pending for that trigger/day', async () => {
  const tmp = path.join(__dirname, `tmp-marketing-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const todayIso = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO customers (id, name, phone, birthday, whatsapp_consent) VALUES (1, 'Alice', '0123456789', ?, 1)`).run(`1990-${todayIso.slice(5)}`);

  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });

  const before = await agent.get('/api/marketing/pending');
  assert.equal(before.status, 200);
  assert.equal(before.body.length, 1);
  assert.equal(before.body[0].triggerType, 'birthday');

  const markSent = await agent.post('/api/marketing/1/mark-sent').send({ triggerType: 'birthday' });
  assert.equal(markSent.status, 200);

  const logRows = db.prepare(`SELECT * FROM message_log WHERE customer_id = 1 AND channel = 'whatsapp' AND trigger_type = 'birthday'`).all();
  assert.equal(logRows.length, 1);

  const after = await agent.get('/api/marketing/pending');
  assert.equal(after.status, 200);
  assert.equal(after.body.length, 0);

  db.close(); fs.unlinkSync(tmp);
});

test('pending list includes a customer with a voucher issued today, and dedupes it separately from birthday', async () => {
  const tmp = path.join(__dirname, `tmp-marketing-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  db.prepare(`INSERT INTO customers (id, name, phone, whatsapp_consent) VALUES (1, 'Charlie', '0134567890', 1)`).run();
  const now = new Date();
  db.prepare(`
    INSERT INTO vouchers (customer_id, type, value, min_spend, issued_at, expires_at)
    VALUES (1, 'monthly-tier', 5, 100, ?, NULL)
  `).run(now.toISOString());

  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });

  const before = await agent.get('/api/marketing/pending');
  assert.equal(before.status, 200);
  assert.equal(before.body.length, 1);
  assert.equal(before.body[0].triggerType, 'voucher');
  assert.match(before.body[0].message, /RM5 off \(min spend RM100\)/);

  await agent.post('/api/marketing/1/mark-sent').send({ triggerType: 'voucher' });

  const after = await agent.get('/api/marketing/pending');
  assert.equal(after.body.length, 0);

  db.close(); fs.unlinkSync(tmp);
});
