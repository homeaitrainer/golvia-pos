const {
  isBirthdayToday,
  buildBirthdayVoucher,
  monthlyVoucherRulesForTier,
  hasMetMonthlyEligibility,
} = require('./voucherEngine');
const { sendEmail } = require('./emailService');

// Best-effort notification: voucher issuance must never fail or block because of an email
// problem (unconfigured Gmail creds, SMTP hiccup, etc). sendEmail() is async -- it can reject
// (not throw synchronously) even for the EMAIL_NOT_CONFIGURED case -- so this is wired with
// .then/.catch rather than try/catch around the call, which would not observe a rejection.
// A message_log row is written ONLY on a confirmed successful send.
function notifyCustomer(db, customer, triggerType, subject, html) {
  if (!customer.email) return;
  sendEmail(db, { to: customer.email, subject, html })
    .then(() => {
      db.prepare(`
        INSERT INTO message_log (customer_id, channel, trigger_type) VALUES (?, 'email', ?)
      `).run(customer.id, triggerType);
    })
    .catch((err) => {
      console.warn(`Failed to send ${triggerType} email to customer ${customer.id}:`, err.message);
    });
}

// Local-date-key helpers, mirroring the discipline already established in voucherEngine.js:
// derive calendar days from a Date's LOCAL components, never from toISOString() (UTC) or
// SQLite's date('now') (also UTC) -- this app runs in Malaysia (UTC+8), so a naive UTC
// comparison can shift a day near local midnight.
function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function endOfMonthLocal(year, monthIndex) {
  // Day 0 of the following month is the last day of `monthIndex`.
  const lastDay = new Date(year, monthIndex + 1, 0);
  const y = lastDay.getFullYear();
  const m = String(lastDay.getMonth() + 1).padStart(2, '0');
  const d = String(lastDay.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T23:59:59`;
}

function runVoucherChecks(db, now = new Date()) {
  let birthdayVouchersIssued = 0;
  let monthlyVouchersIssued = 0;

  const todayKey = localDateKey(now);
  const year = now.getFullYear();
  const monthIndex = now.getMonth();

  const customers = db.prepare('SELECT * FROM customers').all();

  const insertVoucher = db.prepare(`
    INSERT INTO vouchers (customer_id, type, value, min_spend, issued_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // --- Birthday vouchers ---
  for (const customer of customers) {
    if (!isBirthdayToday(customer.birthday, now)) continue;

    const existingBirthdayVouchers = db.prepare(`
      SELECT issued_at FROM vouchers WHERE customer_id = ? AND type = 'birthday'
    `).all(customer.id);
    const alreadyIssuedToday = existingBirthdayVouchers.some(
      v => localDateKey(new Date(v.issued_at)) === todayKey
    );
    if (alreadyIssuedToday) continue;

    const voucher = buildBirthdayVoucher(customer.id, now);
    insertVoucher.run(
      voucher.customer_id, voucher.type, voucher.value, voucher.min_spend, voucher.issued_at, voucher.expires_at
    );
    birthdayVouchersIssued++;

    notifyCustomer(
      db, customer, 'birthday',
      'Happy Birthday from GOLVIA!',
      `<p>Happy Birthday, ${customer.name}!</p><p>To celebrate, we've added a <strong>RM10 voucher</strong> to your account -- valid today only. Visit us in-store to redeem it.</p>`
    );
  }

  // --- Monthly tier vouchers ---
  for (const customer of customers) {
    const invoices = db.prepare('SELECT created_at, subtotal FROM invoices WHERE customer_id = ?').all(customer.id);

    // Group by LOCAL calendar day (converting each stored UTC created_at back to local date
    // components), restricted to the current calendar month relative to `now`.
    const spendByDay = new Map();
    for (const invoice of invoices) {
      const createdAt = new Date(invoice.created_at);
      if (createdAt.getFullYear() !== year || createdAt.getMonth() !== monthIndex) continue;
      const dayKey = localDateKey(createdAt);
      spendByDay.set(dayKey, (spendByDay.get(dayKey) || 0) + invoice.subtotal);
    }

    const qualifyingDays = [...spendByDay.entries()]
      .filter(([, spend]) => spend >= 30)
      .map(([dayKey]) => dayKey);

    if (!hasMetMonthlyEligibility(qualifyingDays)) continue;

    const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(customer.id);
    const tier = account ? account.tier : 'White';
    const rules = monthlyVoucherRulesForTier(tier);

    const existingMonthlyVouchers = db.prepare(`
      SELECT value, issued_at FROM vouchers WHERE customer_id = ? AND type = 'monthly-tier'
    `).all(customer.id);

    const expiresAt = endOfMonthLocal(year, monthIndex);

    for (const rule of rules) {
      const alreadyIssuedThisMonth = existingMonthlyVouchers.some(v => {
        if (v.value !== rule.value) return false;
        const issuedAt = new Date(v.issued_at);
        return issuedAt.getFullYear() === year && issuedAt.getMonth() === monthIndex;
      });
      if (alreadyIssuedThisMonth) continue;

      insertVoucher.run(customer.id, 'monthly-tier', rule.value, rule.minSpend, now.toISOString(), expiresAt);
      monthlyVouchersIssued++;

      notifyCustomer(
        db, customer, 'monthly-voucher',
        'New GOLVIA Voucher Unlocked',
        `<p>Hi ${customer.name},</p><p>You've unlocked a new <strong>RM${rule.value} voucher</strong> (minimum spend RM${rule.minSpend}) at GOLVIA Jewellery. It's valid until the end of this month -- see you soon!</p>`
      );
    }
  }

  return { birthdayVouchersIssued, monthlyVouchersIssued };
}

module.exports = { runVoucherChecks };
