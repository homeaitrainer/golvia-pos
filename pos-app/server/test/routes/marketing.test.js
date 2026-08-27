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
