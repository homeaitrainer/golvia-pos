const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

function withMembership(db, customer) {
  const membership = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(customer.id);
  return { ...customer, membership };
}

function customersRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const { search } = req.query;
    let rows;
    if (search) {
      const like = `%${search}%`;
      rows = db.prepare('SELECT * FROM customers WHERE phone LIKE ? OR name LIKE ? OR email LIKE ?').all(like, like, like);
    } else {
      rows = db.prepare('SELECT * FROM customers').all();
    }
    res.json(rows.map(c => withMembership(db, c)));
  });

  router.get('/by-phone/:phone', (req, res) => {
    const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(req.params.phone);
    if (!customer) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(withMembership(db, customer));
  });

  router.get('/:id', (req, res) => {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'NOT_FOUND' });
    const invoices = db.prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ ...withMembership(db, customer), invoices });
  });

  router.post('/', (req, res) => {
    const { name, phone, email, state, gender, birthday, notes, whatsapp_consent } = req.body;
    const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
    if (existing) return res.status(409).json({ error: 'PHONE_EXISTS' });

    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO customers (name, phone, email, state, gender, birthday, notes, whatsapp_consent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(name, phone, email, state, gender, birthday, notes, whatsapp_consent ? 1 : 0);
      const customerId = result.lastInsertRowid;
      db.prepare(`
        INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (?, 0, 0, 'White')
      `).run(customerId);
      return customerId;
    });
    const customerId = tx();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    res.status(201).json(withMembership(db, customer));
  });

  router.put('/:id', (req, res) => {
    const { name, email, state, gender, birthday, notes, whatsapp_consent } = req.body;
    db.prepare(`
      UPDATE customers SET name = ?, email = ?, state = ?, gender = ?, birthday = ?, notes = ?, whatsapp_consent = ? WHERE id = ?
    `).run(name, email, state, gender, birthday, notes, whatsapp_consent ? 1 : 0, req.params.id);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(withMembership(db, customer));
  });

  return router;
}

module.exports = { customersRouter };
