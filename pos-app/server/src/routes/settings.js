const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

function settingsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM settings').all();
    const obj = {};
    for (const r of rows) {
      if (r.key === 'gmail_app_password') continue; // write-only secret: never echoed back
      obj[r.key] = r.value;
    }
    res.json(obj);
  });

  router.put('/', (req, res) => {
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(req.body)) {
        upsert.run(key, String(value));
      }
    });
    tx();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { settingsRouter };
