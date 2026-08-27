const bcrypt = require('bcryptjs');

function createAdmin(db, username, password) {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT OR REPLACE INTO admin_users (id, username, password_hash) VALUES (1, ?, ?)').run(username, hash);
}

function verifyLogin(db, username, password) {
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

module.exports = { createAdmin, verifyLogin };
