const nodemailer = require('nodemailer');

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

async function sendEmail(db, { to, subject, html }) {
  const user = getSetting(db, 'gmail_address');
  const pass = getSetting(db, 'gmail_app_password');
  if (!user || !pass) throw new Error('EMAIL_NOT_CONFIGURED');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter.sendMail({ from: user, to, subject, html });
}

module.exports = { sendEmail, getSetting };
