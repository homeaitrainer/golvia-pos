const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { createAdmin, verifyLogin } = require('../../src/services/authService');
const { setAdminPassword } = require('../../src/services/setAdminPassword');

function freshDb() {
  const tmp = path.join(__dirname, `tmp-setpw-${Date.now()}-${Math.random()}.sqlite`);
  return { db: initDb(tmp), tmp };
}

test('setAdminPassword replaces the credentials and invalidates the old password', () => {
  const { db, tmp } = freshDb();
  createAdmin(db, 'admin', 'changeme123');
  assert.equal(verifyLogin(db, 'admin', 'changeme123'), true);

  setAdminPassword(db, 'admin', 'a-much-better-passphrase');

  assert.equal(verifyLogin(db, 'admin', 'a-much-better-passphrase'), true);
  assert.equal(verifyLogin(db, 'admin', 'changeme123'), false);
  // Still exactly one admin -- this rotates the account rather than adding a second one.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM admin_users').get().c, 1);
  db.close(); fs.unlinkSync(tmp);
});

test('setAdminPassword can also rename the admin account', () => {
  const { db, tmp } = freshDb();
  createAdmin(db, 'admin', 'changeme123');

  setAdminPassword(db, 'golvia-owner', 'a-much-better-passphrase');

  assert.equal(verifyLogin(db, 'golvia-owner', 'a-much-better-passphrase'), true);
  assert.equal(verifyLogin(db, 'admin', 'a-much-better-passphrase'), false);
  db.close(); fs.unlinkSync(tmp);
});

test('setAdminPassword rejects a short password rather than silently accepting it', () => {
  const { db, tmp } = freshDb();
  createAdmin(db, 'admin', 'changeme123');

  assert.throws(() => setAdminPassword(db, 'admin', 'short'), /at least 8 characters/);
  // The existing password must still work -- a rejected change must not lock the shop out.
  assert.equal(verifyLogin(db, 'admin', 'changeme123'), true);
  db.close(); fs.unlinkSync(tmp);
});

test('setAdminPassword rejects a blank username', () => {
  const { db, tmp } = freshDb();
  createAdmin(db, 'admin', 'changeme123');
  assert.throws(() => setAdminPassword(db, '   ', 'a-much-better-passphrase'), /username is required/);
  db.close(); fs.unlinkSync(tmp);
});
