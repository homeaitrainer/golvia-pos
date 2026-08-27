const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

function setup() {
  const tmp = path.join(__dirname, `tmp-auth-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const app = createApp(db);
  return { app, db, tmp };
}

test('rejects bad credentials', async () => {
  const { app, db, tmp } = setup();
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
  db.close(); fs.unlinkSync(tmp);
});

test('accepts correct credentials and grants access to protected route', async () => {
  const { app, db, tmp } = setup();
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  assert.equal(login.status, 200);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.username, 'admin');

  db.close(); fs.unlinkSync(tmp);
});

test('protected route rejects unauthenticated requests', async () => {
  const { app, db, tmp } = setup();
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
  db.close(); fs.unlinkSync(tmp);
});
