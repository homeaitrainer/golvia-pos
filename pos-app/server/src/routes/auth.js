const express = require('express');
const crypto = require('crypto');
const { verifyLogin } = require('../services/authService');
const { requireAuth, issueSession, revokeSession } = require('../middleware/requireAuth');

function authRouter(db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!verifyLogin(db, username, password)) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    issueSession(token);
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ username });
  });

  router.post('/logout', requireAuth, (req, res) => {
    revokeSession(req.cookies.session);
    res.clearCookie('session');
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT username FROM admin_users LIMIT 1').get();
    res.json(user);
  });

  return router;
}

module.exports = { authRouter };
