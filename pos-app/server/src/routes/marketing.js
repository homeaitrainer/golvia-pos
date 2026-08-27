const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { buildWhatsAppLink } = require('../services/whatsappService');
const { isBirthdayToday } = require('../services/voucherEngine');

// Local-day boundaries as UTC ISO strings, mirroring dashboard.js's discipline: `sent_at` /
// `issued_at` are stored as UTC ISO strings, but "today" must be computed from LOCAL date
// components (this app runs in Malaysia, UTC+8) -- so a plain string range comparison against
// local-midnight boundaries is used instead of SQLite's UTC-based date()/strftime().
function localDayBoundaries(now) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function marketingRouter(db, now = () => new Date()) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/pending', (req, res) => {
    const { startIso, endIso } = localDayBoundaries(now());
    const consented = db.prepare('SELECT * FROM customers WHERE whatsapp_consent = 1').all();
    const consentedById = new Map(consented.map(c => [c.id, c]));

    // Customer+triggerType combos already marked sent today -- these drop off the list until
    // the next local day (or, for vouchers, until a new voucher is issued).
    const sentTodayRows = db.prepare(`
      SELECT customer_id, trigger_type FROM message_log
      WHERE channel = 'whatsapp' AND sent_at >= ? AND sent_at < ?
    `).all(startIso, endIso);
    const alreadySent = new Set(sentTodayRows.map(r => `${r.customer_id}:${r.trigger_type}`));

    const pending = [];

    for (const c of consented) {
      if (!isBirthdayToday(c.birthday, now())) continue;
      if (alreadySent.has(`${c.id}:birthday`)) continue;
      const message = `Happy Birthday ${c.name}! Enjoy RM10 off today only at GOLVIA Jewellery.`;
      pending.push({ ...c, triggerType: 'birthday', message, whatsappLink: buildWhatsAppLink(c.phone, message) });
    }

    const vouchersToday = db.prepare(`
      SELECT * FROM vouchers WHERE issued_at >= ? AND issued_at < ?
    `).all(startIso, endIso);
    const voucherCustomersAdded = new Set();
    for (const v of vouchersToday) {
      const c = consentedById.get(v.customer_id);
      if (!c) continue;
      if (alreadySent.has(`${c.id}:voucher`)) continue;
      if (voucherCustomersAdded.has(c.id)) continue;
      voucherCustomersAdded.add(c.id);
      const message = `New voucher unlocked: RM${v.value} off (min spend RM${v.min_spend})!`;
      pending.push({ ...c, triggerType: 'voucher', message, whatsappLink: buildWhatsAppLink(c.phone, message) });
    }

    res.json(pending);
  });

  router.post('/:customerId/mark-sent', (req, res) => {
    const { triggerType } = req.body;
    if (!triggerType) return res.status(400).json({ error: 'TRIGGER_TYPE_REQUIRED' });
    db.prepare(`
      INSERT INTO message_log (customer_id, channel, trigger_type, sent_at) VALUES (?, 'whatsapp', ?, ?)
    `).run(req.params.customerId, triggerType, now().toISOString());
    res.json({ ok: true });
  });

  return router;
}

module.exports = { marketingRouter };
