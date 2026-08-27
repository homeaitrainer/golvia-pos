const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { buildWhatsAppLink } = require('../services/whatsappService');
const { isBirthdayToday } = require('../services/voucherEngine');

function marketingRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/pending', (req, res) => {
    const consented = db.prepare('SELECT * FROM customers WHERE whatsapp_consent = 1').all();
    const today = new Date();
    const pending = consented
      .filter(c => isBirthdayToday(c.birthday, today))
      .map(c => ({
        ...c,
        triggerType: 'birthday',
        message: `Happy Birthday ${c.name}! Enjoy RM10 off today only at GOLVIA Jewellery.`,
        whatsappLink: buildWhatsAppLink(c.phone, `Happy Birthday ${c.name}! Enjoy RM10 off today only at GOLVIA Jewellery.`),
      }));
    res.json(pending);
  });

  return router;
}

module.exports = { marketingRouter };
