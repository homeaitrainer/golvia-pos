const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function initDb(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(filePath);
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

let singleton = null;
function getDb() {
  if (!singleton) {
    const filePath = process.env.DB_PATH || path.join(__dirname, '../../data/golvia.db');
    singleton = initDb(filePath);
  }
  return singleton;
}

module.exports = { initDb, getDb };
