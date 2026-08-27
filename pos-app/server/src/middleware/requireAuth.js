const sessions = new Set();

function issueSession(token) {
  sessions.add(token);
}

function revokeSession(token) {
  sessions.delete(token);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.session;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'UNAUTHENTICATED' });
  }
  next();
}

module.exports = { requireAuth, issueSession, revokeSession, sessions };
