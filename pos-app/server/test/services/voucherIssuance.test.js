const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { runVoucherChecks } = require('../../src/services/voucherIssuance');

function setup() {
  const tmp = path.join(__dirname, `tmp-voucher-issuance-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  return { db, tmp };
}

let invoiceCounter = 0;
function insertInvoice(db, customerId, dateObj, subtotal) {
  invoiceCounter++;
  db.prepare(`
    INSERT INTO invoices (invoice_number, customer_id, subtotal, discount_total, coins_redeemed, coins_earned, total, payment_method, status, created_at)
    VALUES (?, ?, ?, 0, 0, 0, ?, 'Cash', 'completed', ?)
  `).run(`INV-TEST-${invoiceCounter}`, customerId, subtotal, subtotal, dateObj.toISOString());
}

test('a customer with today\'s birthday gets a birthday voucher issued', () => {
  const { db, tmp } = setup();
  const now = new Date(2026, 7, 20, 10, 0, 0); // Aug 20, 2026, local time
  db.prepare(`INSERT INTO customers (id, name, phone, birthday) VALUES (1, 'Alice', '0123456789', '1990-08-20')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();

  const result = runVoucherChecks(db, now);
  assert.equal(result.birthdayVouchersIssued, 1);

  const vouchers = db.prepare(`SELECT * FROM vouchers WHERE customer_id = 1 AND type = 'birthday'`).all();
  assert.equal(vouchers.length, 1);
  assert.equal(vouchers[0].value, 10);
  assert.equal(vouchers[0].min_spend, 0);
  assert.ok(vouchers[0].expires_at.startsWith('2026-08-20'));
  assert.equal(vouchers[0].redeemed_at, null);

  db.close(); fs.unlinkSync(tmp);
});

test('running the birthday check twice does not issue a duplicate voucher', () => {
  const { db, tmp } = setup();
  const now = new Date(2026, 7, 20, 10, 0, 0);
  db.prepare(`INSERT INTO customers (id, name, phone, birthday) VALUES (1, 'Alice', '0123456789', '1990-08-20')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();

  const first = runVoucherChecks(db, now);
  assert.equal(first.birthdayVouchersIssued, 1);

  const second = runVoucherChecks(db, now);
  assert.equal(second.birthdayVouchersIssued, 0);

  const vouchers = db.prepare(`SELECT * FROM vouchers WHERE customer_id = 1 AND type = 'birthday'`).all();
  assert.equal(vouchers.length, 1);

  db.close(); fs.unlinkSync(tmp);
});

test('a customer meeting 7 qualifying days (>=RM30 spend) in the current month unlocks their tier\'s monthly vouchers', () => {
  const { db, tmp } = setup();
  const now = new Date(2026, 7, 20, 10, 0, 0); // Aug 20, 2026
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Bob', '0198765432')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();

  // 7 distinct qualifying days within August 2026, each with subtotal >= RM30, before `now`.
  for (let day = 1; day <= 7; day++) {
    insertInvoice(db, 1, new Date(2026, 7, day, 12, 0, 0), 30);
  }

  const result = runVoucherChecks(db, now);
  assert.equal(result.monthlyVouchersIssued, 1); // White tier -> just one rule: RM3/min50

  const vouchers = db.prepare(`SELECT * FROM vouchers WHERE customer_id = 1 AND type = 'monthly-tier'`).all();
  assert.equal(vouchers.length, 1);
  assert.equal(vouchers[0].value, 3);
  assert.equal(vouchers[0].min_spend, 50);
  assert.ok(vouchers[0].expires_at.startsWith('2026-08-31'));
  assert.equal(vouchers[0].redeemed_at, null);

  db.close(); fs.unlinkSync(tmp);
});

test('running the monthly check twice does not duplicate monthly vouchers', () => {
  const { db, tmp } = setup();
  const now = new Date(2026, 7, 20, 10, 0, 0);
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Bob', '0198765432')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'Silver')`).run();

  for (let day = 1; day <= 7; day++) {
    insertInvoice(db, 1, new Date(2026, 7, day, 12, 0, 0), 30);
  }

  const first = runVoucherChecks(db, now);
  assert.equal(first.monthlyVouchersIssued, 2); // Silver tier -> White + Silver rules

  const second = runVoucherChecks(db, now);
  assert.equal(second.monthlyVouchersIssued, 0);

  const vouchers = db.prepare(`SELECT * FROM vouchers WHERE customer_id = 1 AND type = 'monthly-tier'`).all();
  assert.equal(vouchers.length, 2);

  db.close(); fs.unlinkSync(tmp);
});

test('a customer with fewer than 7 qualifying days does not get monthly vouchers', () => {
  const { db, tmp } = setup();
  const now = new Date(2026, 7, 20, 10, 0, 0);
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Bob', '0198765432')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();

  for (let day = 1; day <= 6; day++) {
    insertInvoice(db, 1, new Date(2026, 7, day, 12, 0, 0), 30);
  }

  const result = runVoucherChecks(db, now);
  assert.equal(result.monthlyVouchersIssued, 0);

  db.close(); fs.unlinkSync(tmp);
});
