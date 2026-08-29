// CLI: node src/services/setAdminPassword.js <username> <password>
//
// The app ships with a single admin account and, until now, no way to change its password -- the
// account created at setup (`admin` / `changeme123`) was permanent. That is poor practice on a
// shared shop computer and a hard blocker for any internet-exposed deployment, so this is the
// supported way to rotate it.
const { createAdmin } = require('./authService');

const MIN_PASSWORD_LENGTH = 8;

function setAdminPassword(db, username, password) {
  if (!username || !username.trim()) {
    throw new Error('A username is required.');
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  // createAdmin upserts the single admin row (id = 1), so this both renames and re-hashes.
  createAdmin(db, username.trim(), password);
  return { username: username.trim() };
}

if (require.main === module) {
  const { getDb } = require('../db/db');
  const [username, password] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: node src/services/setAdminPassword.js <username> <password>');
    console.error('Example: node src/services/setAdminPassword.js admin "a-long-passphrase"');
    process.exit(1);
  }

  try {
    const result = setAdminPassword(getDb(), username, password);
    console.log(`Admin login updated. Username is now "${result.username}".`);
    console.log('Existing sessions stay valid until the server restarts -- restart it to force a re-login.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { setAdminPassword, MIN_PASSWORD_LENGTH };
