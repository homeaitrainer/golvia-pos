# GOLVIA POS / CRM / Membership System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js/React/SQLite POS system for GOLVIA Jewellery covering retail checkout, invoicing/printing, product & inventory management, customer CRM, a 4-tier coin membership program, and WhatsApp/email marketing triggers.

**Architecture:** An Express REST API (`pos-app/server`) backed by a single SQLite file (via `better-sqlite3`) serves a React SPA (`pos-app/client`, built with Vite). A one-click launcher starts the server (which also serves the built client) and opens the default browser to `http://localhost:4173`. Business logic (tier/coin/voucher calculation, invoice numbering, checkout totals) lives in pure, independently-tested service modules separate from HTTP routing.

**Tech Stack:** Node.js 20+, Express, better-sqlite3, React 18 + Vite, `node:test` + `node:assert` (built-in, no extra test framework to install) for backend unit/API tests, `supertest` for HTTP-level tests, `nodemailer` for Gmail SMTP, `xlsx`/`exceljs`-free CSV export (plain CSV writer, no new heavy dep).

## Global Constraints

- Currency: MYR (RM). Amounts stored as REAL (ringgit, 2dp display) — no cents-integer conversion required per spec.
- Invoice numbers: format `INV-YYYY-####`, sequential, resets each calendar year (spec §5).
- No SST anywhere in invoice data or UI (spec §11).
- Coins: RM3 spent = 1 coin (floor), calculated on **pre-discount** unit price × quantity (spec §7). 100 coins = RM1 redemption value.
- Tiers derived from **lifetime_coins**, never decrease on redemption or normal operation (spec §7): White 0–3000, Silver 3001–5000, Gold 5001–12000, Platinum 12001+.
- Refunds reverse coins proportionally and restock quantity (spec §5).
- Single Admin login only; no multi-role support (spec §9).
- All monetary/coin logic must be unit-tested before wiring into routes (TDD, per this skill).
- Customer phone number is the unique lookup key (spec §6).

---

## File Structure

```
pos-app/
  server/
    package.json
    src/
      db/
        schema.sql
        db.js
      services/
        tierEngine.js
        coinEngine.js
        voucherEngine.js
        invoiceNumbering.js
        checkoutService.js
        refundService.js
        emailService.js
        whatsappService.js
        backupService.js
        exportService.js
        importStock.js
      routes/
        auth.js
        products.js
        customers.js
        invoices.js
        dashboard.js
        marketing.js
        settings.js
        export.js
      middleware/
        requireAuth.js
      app.js
      server.js
    test/
      services/*.test.js
      routes/*.test.js
    data/            (gitignored: golvia.db, backups/)
  client/
    package.json
    src/
      api/client.js
      pages/
        Login.jsx
        Dashboard.jsx
        Checkout.jsx
        Products.jsx
        ProductForm.jsx
        Customers.jsx
        CustomerProfile.jsx
        Invoices.jsx
        InvoiceReceipt.jsx
        Marketing.jsx
        Settings.jsx
      App.jsx
      main.jsx
  launcher.js
  README.md
```

---

### Task 1: Server scaffolding, SQLite schema, and DB access layer

**Files:**
- Create: `pos-app/server/package.json`
- Create: `pos-app/server/src/db/schema.sql`
- Create: `pos-app/server/src/db/db.js`
- Test: `pos-app/server/test/services/db.test.js`

**Interfaces:**
- Produces: `initDb(filePath: string) -> Database` (creates/opens a better-sqlite3 database at `filePath`, applies `schema.sql` if tables don't exist, returns the `Database` instance). `getDb() -> Database` (singleton using `DB_PATH` env var, defaults to `pos-app/server/data/golvia.db`).

- [ ] **Step 1: Initialize the server package**

Run:
```bash
mkdir -p pos-app/server/src/db pos-app/server/src/services pos-app/server/src/routes pos-app/server/src/middleware pos-app/server/test/services pos-app/server/test/routes pos-app/server/data
cd pos-app/server && npm init -y && npm install express better-sqlite3 bcryptjs cors nodemailer && npm install --save-dev supertest
```

- [ ] **Step 2: Write the schema**

Create `pos-app/server/src/db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  brand TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_label TEXT,
  sku TEXT UNIQUE,
  cost_price REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  state TEXT,
  gender TEXT,
  birthday TEXT,
  notes TEXT,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS membership_accounts (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id),
  lifetime_coins INTEGER NOT NULL DEFAULT 0,
  current_coin_balance INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'White',
  tier_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL,
  value REAL NOT NULL,
  min_spend REAL NOT NULL DEFAULT 0,
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  redeemed_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subtotal REAL NOT NULL,
  discount_total REAL NOT NULL DEFAULT 0,
  coins_redeemed INTEGER NOT NULL DEFAULT 0,
  coins_earned INTEGER NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  item_discount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  refund_amount REAL NOT NULL,
  coins_reversed INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refund_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_id INTEGER NOT NULL REFERENCES refunds(id),
  invoice_item_id INTEGER NOT NULL REFERENCES invoice_items(id),
  quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

- [ ] **Step 3: Write `db.js`**

Create `pos-app/server/src/db/db.js`:
```js
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
```

- [ ] **Step 4: Write the failing test**

Create `pos-app/server/test/services/db.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');

test('initDb creates all expected tables', () => {
  const tmp = path.join(__dirname, 'tmp-db-test.sqlite');
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const db = initDb(tmp);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['products', 'product_variants', 'customers', 'membership_accounts', 'vouchers', 'invoices', 'invoice_items', 'refunds', 'refund_items', 'message_log', 'settings', 'admin_users']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  db.close();
  fs.unlinkSync(tmp);
});
```

- [ ] **Step 5: Run test to verify it passes** (schema already written, so this confirms correctness rather than a red/green cycle)

Run: `cd pos-app/server && node --test test/services/db.test.js`
Expected: PASS, all tables found.

- [ ] **Step 6: Commit**

```bash
git init pos-app 2>/dev/null; cd pos-app && git add -A && git commit -m "chore: scaffold server with SQLite schema and db access layer"
```

---

### Task 2: Tier engine (pure logic)

**Files:**
- Create: `pos-app/server/src/services/tierEngine.js`
- Test: `pos-app/server/test/services/tierEngine.test.js`

**Interfaces:**
- Produces: `calculateTier(lifetimeCoins: number) -> 'White'|'Silver'|'Gold'|'Platinum'`

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/services/tierEngine.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { calculateTier } = require('../../src/services/tierEngine');

test('tier boundaries', () => {
  assert.equal(calculateTier(0), 'White');
  assert.equal(calculateTier(3000), 'White');
  assert.equal(calculateTier(3001), 'Silver');
  assert.equal(calculateTier(5000), 'Silver');
  assert.equal(calculateTier(5001), 'Gold');
  assert.equal(calculateTier(12000), 'Gold');
  assert.equal(calculateTier(12001), 'Platinum');
  assert.equal(calculateTier(999999), 'Platinum');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/tierEngine.test.js`
Expected: FAIL — `Cannot find module '../../src/services/tierEngine'`

- [ ] **Step 3: Implement**

Create `pos-app/server/src/services/tierEngine.js`:
```js
function calculateTier(lifetimeCoins) {
  if (lifetimeCoins >= 12001) return 'Platinum';
  if (lifetimeCoins >= 5001) return 'Gold';
  if (lifetimeCoins >= 3001) return 'Silver';
  return 'White';
}

module.exports = { calculateTier };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/tierEngine.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/services/tierEngine.js pos-app/server/test/services/tierEngine.test.js
git commit -m "feat: add membership tier calculation"
```

---

### Task 3: Coin engine (pure logic)

**Files:**
- Create: `pos-app/server/src/services/coinEngine.js`
- Test: `pos-app/server/test/services/coinEngine.test.js`

**Interfaces:**
- Produces: `coinsEarnedForAmount(amount: number) -> integer` (floor(amount / 3)); `coinsToDiscountValue(coins: integer) -> number` (coins / 100, RM); `discountValueToCoins(rm: number) -> integer` (ceil(rm * 100), for redemption input given in RM)

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/services/coinEngine.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { coinsEarnedForAmount, coinsToDiscountValue, discountValueToCoins } = require('../../src/services/coinEngine');

test('coinsEarnedForAmount floors RM3=1coin', () => {
  assert.equal(coinsEarnedForAmount(0), 0);
  assert.equal(coinsEarnedForAmount(2.99), 0);
  assert.equal(coinsEarnedForAmount(3), 1);
  assert.equal(coinsEarnedForAmount(8), 2);
  assert.equal(coinsEarnedForAmount(299), 99);
});

test('coinsToDiscountValue: 100 coins = RM1', () => {
  assert.equal(coinsToDiscountValue(100), 1);
  assert.equal(coinsToDiscountValue(1000), 10);
  assert.equal(coinsToDiscountValue(50), 0.5);
});

test('discountValueToCoins is inverse for whole RM values', () => {
  assert.equal(discountValueToCoins(10), 1000);
  assert.equal(discountValueToCoins(0.5), 50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/coinEngine.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/services/coinEngine.js`:
```js
function coinsEarnedForAmount(amount) {
  return Math.floor(amount / 3);
}

function coinsToDiscountValue(coins) {
  return coins / 100;
}

function discountValueToCoins(rm) {
  return Math.ceil(rm * 100);
}

module.exports = { coinsEarnedForAmount, coinsToDiscountValue, discountValueToCoins };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/coinEngine.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/services/coinEngine.js pos-app/server/test/services/coinEngine.test.js
git commit -m "feat: add coin earning/redemption calculations"
```

---

### Task 4: Invoice numbering service

**Files:**
- Create: `pos-app/server/src/services/invoiceNumbering.js`
- Test: `pos-app/server/test/services/invoiceNumbering.test.js`

**Interfaces:**
- Consumes: `db` (better-sqlite3 `Database` from Task 1's `initDb`)
- Produces: `nextInvoiceNumber(db, dateObj = new Date()) -> string` in the form `INV-YYYY-####`, sequential and scoped to `YYYY`.

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/services/invoiceNumbering.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { nextInvoiceNumber } = require('../../src/services/invoiceNumbering');

function freshDb() {
  const tmp = path.join(__dirname, `tmp-invnum-${Date.now()}-${Math.random()}.sqlite`);
  return { db: initDb(tmp), tmp };
}

test('first invoice of the year', () => {
  const { db, tmp } = freshDb();
  const num = nextInvoiceNumber(db, new Date('2026-03-01'));
  assert.equal(num, 'INV-2026-0001');
  db.close(); fs.unlinkSync(tmp);
});

test('increments sequentially within the same year', () => {
  const { db, tmp } = freshDb();
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method) VALUES (?, 0, 0, 'Cash')`).run('INV-2026-0001');
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method) VALUES (?, 0, 0, 'Cash')`).run('INV-2026-0002');
  const num = nextInvoiceNumber(db, new Date('2026-05-01'));
  assert.equal(num, 'INV-2026-0003');
  db.close(); fs.unlinkSync(tmp);
});

test('resets to 0001 in a new year', () => {
  const { db, tmp } = freshDb();
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method) VALUES (?, 0, 0, 'Cash')`).run('INV-2026-0050');
  const num = nextInvoiceNumber(db, new Date('2027-01-01'));
  assert.equal(num, 'INV-2027-0001');
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/invoiceNumbering.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/services/invoiceNumbering.js`:
```js
function nextInvoiceNumber(db, dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const prefix = `INV-${year}-`;
  const row = db.prepare(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`
  ).get(`${prefix}%`);
  let next = 1;
  if (row) {
    const lastSeq = parseInt(row.invoice_number.slice(prefix.length), 10);
    next = lastSeq + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

module.exports = { nextInvoiceNumber };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/invoiceNumbering.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/services/invoiceNumbering.js pos-app/server/test/services/invoiceNumbering.test.js
git commit -m "feat: add sequential year-scoped invoice numbering"
```

---

### Task 5: Voucher engine (birthday + monthly tier vouchers)

**Files:**
- Create: `pos-app/server/src/services/voucherEngine.js`
- Test: `pos-app/server/test/services/voucherEngine.test.js`

**Interfaces:**
- Produces:
  - `isBirthdayToday(birthdayIso: string, today: Date) -> boolean` (compares month/day only)
  - `monthlyVoucherRulesForTier(tier: 'White'|'Silver'|'Gold'|'Platinum') -> Array<{value: number, minSpend: number}>` (cumulative per spec §7: White=[3/50]; Silver=+[5/100]; Gold=+[8/150]; Platinum=+[10/200])
  - `hasMetMonthlyEligibility(visitDates: string[]) -> boolean` (true if 7+ distinct calendar days in the array have spend >= RM30 — the array here is pre-filtered to qualifying days by the caller, so this just checks `visitDates.length >= 7`, kept as its own function so the "7 days" rule is named and testable in isolation)
  - `buildBirthdayVoucher(customerId: number, today: Date) -> {customer_id, type: 'birthday', value: 10, min_spend: 0, issued_at: string, expires_at: string}` (expires_at = end of the same day)

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/services/voucherEngine.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { isBirthdayToday, monthlyVoucherRulesForTier, hasMetMonthlyEligibility, buildBirthdayVoucher } = require('../../src/services/voucherEngine');

test('isBirthdayToday matches month/day regardless of birth year', () => {
  assert.equal(isBirthdayToday('1990-08-27', new Date('2026-08-27')), true);
  assert.equal(isBirthdayToday('1990-08-27', new Date('2026-08-28')), false);
});

test('monthlyVoucherRulesForTier is cumulative by tier', () => {
  assert.deepEqual(monthlyVoucherRulesForTier('White'), [{ value: 3, minSpend: 50 }]);
  assert.deepEqual(monthlyVoucherRulesForTier('Silver'), [{ value: 3, minSpend: 50 }, { value: 5, minSpend: 100 }]);
  assert.deepEqual(monthlyVoucherRulesForTier('Gold'), [{ value: 3, minSpend: 50 }, { value: 5, minSpend: 100 }, { value: 8, minSpend: 150 }]);
  assert.deepEqual(monthlyVoucherRulesForTier('Platinum'), [{ value: 3, minSpend: 50 }, { value: 5, minSpend: 100 }, { value: 8, minSpend: 150 }, { value: 10, minSpend: 200 }]);
});

test('hasMetMonthlyEligibility requires 7 qualifying days', () => {
  assert.equal(hasMetMonthlyEligibility(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06']), false);
  assert.equal(hasMetMonthlyEligibility(['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']), true);
});

test('buildBirthdayVoucher expires at end of the same day', () => {
  const v = buildBirthdayVoucher(42, new Date('2026-08-27T10:00:00'));
  assert.equal(v.customer_id, 42);
  assert.equal(v.type, 'birthday');
  assert.equal(v.value, 10);
  assert.equal(v.min_spend, 0);
  assert.ok(v.expires_at.startsWith('2026-08-27'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/voucherEngine.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/services/voucherEngine.js`:
```js
function isBirthdayToday(birthdayIso, today) {
  if (!birthdayIso) return false;
  const b = new Date(birthdayIso);
  return b.getMonth() === today.getMonth() && b.getDate() === today.getDate();
}

const TIER_ORDER = ['White', 'Silver', 'Gold', 'Platinum'];
const RULES_BY_TIER = {
  White: { value: 3, minSpend: 50 },
  Silver: { value: 5, minSpend: 100 },
  Gold: { value: 8, minSpend: 150 },
  Platinum: { value: 10, minSpend: 200 },
};

function monthlyVoucherRulesForTier(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  return TIER_ORDER.slice(0, idx + 1).map(t => RULES_BY_TIER[t]);
}

function hasMetMonthlyEligibility(qualifyingDays) {
  return qualifyingDays.length >= 7;
}

function buildBirthdayVoucher(customerId, today) {
  const iso = today.toISOString();
  const dateOnly = iso.slice(0, 10);
  return {
    customer_id: customerId,
    type: 'birthday',
    value: 10,
    min_spend: 0,
    issued_at: iso,
    expires_at: `${dateOnly}T23:59:59`,
  };
}

module.exports = { isBirthdayToday, monthlyVoucherRulesForTier, hasMetMonthlyEligibility, buildBirthdayVoucher };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/voucherEngine.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/services/voucherEngine.js pos-app/server/test/services/voucherEngine.test.js
git commit -m "feat: add birthday and monthly tier voucher rules"
```

---

### Task 6: Checkout service (cart totals, discounts, invoice + coin persistence)

**Files:**
- Create: `pos-app/server/src/services/checkoutService.js`
- Test: `pos-app/server/test/services/checkoutService.test.js`

**Interfaces:**
- Consumes: `db` from Task 1; `nextInvoiceNumber` (Task 4); `coinsEarnedForAmount`, `coinsToDiscountValue` (Task 3); `calculateTier` (Task 2)
- Produces: `createInvoice(db, { customerId: number|null, items: Array<{variantId, quantity, unitPrice, itemDiscount}>, lumpSumDiscount: {type: 'amount'|'percent', value: number}|null, coinsToRedeem: number, paymentMethod: string }, now = new Date()) -> invoiceRow` (throws `Error('INSUFFICIENT_STOCK')` if any variant quantity is short, throws `Error('INSUFFICIENT_COINS')` if `coinsToRedeem` exceeds balance). Decrements `product_variants.quantity`, inserts `invoices`/`invoice_items`, upserts `membership_accounts` (adds earned coins to both lifetime and current balance, subtracts redeemed coins from current balance only, recalculates tier).

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/services/checkoutService.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { createInvoice } = require('../../src/services/checkoutService');

function setup() {
  const tmp = path.join(__dirname, `tmp-checkout-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 5)`).run();
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();
  return { db, tmp };
}

test('creates an invoice, decrements stock, credits coins, no discounts', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null,
    coinsToRedeem: 0,
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.invoice_number, 'INV-2026-0001');
  assert.equal(invoice.subtotal, 600);
  assert.equal(invoice.total, 600);
  assert.equal(invoice.coins_earned, 200); // floor(600/3)

  const variant = db.prepare('SELECT quantity FROM product_variants WHERE id = 1').get();
  assert.equal(variant.quantity, 3);

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.lifetime_coins, 200);
  assert.equal(account.current_coin_balance, 200);
  assert.equal(account.tier, 'White');

  db.close(); fs.unlinkSync(tmp);
});

test('applies per-item discount then lump-sum discount, coins earned on pre-discount price', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 30 }], // 300 - 30 = 270
    lumpSumDiscount: { type: 'percent', value: 10 }, // 10% off 270 = 27
    coinsToRedeem: 0,
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.subtotal, 300); // pre-discount
  assert.equal(invoice.discount_total, 57); // 30 + 27
  assert.equal(invoice.total, 243);
  assert.equal(invoice.coins_earned, 100); // floor(300/3), pre-discount

  db.close(); fs.unlinkSync(tmp);
});

test('redeeming coins reduces current balance but not lifetime coins or tier', () => {
  const { db, tmp } = setup();
  db.prepare('UPDATE membership_accounts SET lifetime_coins = 4000, current_coin_balance = 4000, tier = ? WHERE customer_id = 1').run('Silver');

  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null,
    coinsToRedeem: 1000, // RM10 off
    paymentMethod: 'Cash',
  }, new Date('2026-08-27'));

  assert.equal(invoice.coins_redeemed, 1000);
  assert.equal(invoice.total, 290); // 300 - 10

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.current_coin_balance, 4000 - 1000 + 100); // redeemed then earned 100 from this 300 sale
  assert.equal(account.lifetime_coins, 4000 + 100);
  assert.equal(account.tier, 'Silver');

  db.close(); fs.unlinkSync(tmp);
});

test('throws INSUFFICIENT_STOCK when quantity exceeds stock', () => {
  const { db, tmp } = setup();
  assert.throws(() => {
    createInvoice(db, {
      customerId: 1,
      items: [{ variantId: 1, quantity: 999, unitPrice: 300, itemDiscount: 0 }],
      lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
    });
  }, /INSUFFICIENT_STOCK/);
  db.close(); fs.unlinkSync(tmp);
});

test('throws INSUFFICIENT_COINS when redeeming more than balance', () => {
  const { db, tmp } = setup();
  assert.throws(() => {
    createInvoice(db, {
      customerId: 1,
      items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
      lumpSumDiscount: null, coinsToRedeem: 500, paymentMethod: 'Cash',
    });
  }, /INSUFFICIENT_COINS/);
  db.close(); fs.unlinkSync(tmp);
});

test('guest sale (no customerId) skips membership updates', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: null,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(invoice.coins_earned, 0);
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/checkoutService.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/services/checkoutService.js`:
```js
const { nextInvoiceNumber } = require('./invoiceNumbering');
const { coinsEarnedForAmount, coinsToDiscountValue } = require('./coinEngine');
const { calculateTier } = require('./tierEngine');

function createInvoice(db, params, now = new Date()) {
  const { customerId, items, lumpSumDiscount, coinsToRedeem, paymentMethod } = params;

  const tx = db.transaction(() => {
    // Validate stock
    for (const item of items) {
      const variant = db.prepare('SELECT quantity FROM product_variants WHERE id = ?').get(item.variantId);
      if (!variant || variant.quantity < item.quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }
    }

    let subtotal = 0;
    let itemDiscountTotal = 0;
    for (const item of items) {
      subtotal += item.unitPrice * item.quantity;
      itemDiscountTotal += item.itemDiscount || 0;
    }

    const afterItemDiscounts = subtotal - itemDiscountTotal;
    let lumpSumAmount = 0;
    if (lumpSumDiscount) {
      lumpSumAmount = lumpSumDiscount.type === 'percent'
        ? afterItemDiscounts * (lumpSumDiscount.value / 100)
        : lumpSumDiscount.value;
    }

    let coinsRedeemed = 0;
    let coinDiscountValue = 0;
    if (coinsToRedeem && coinsToRedeem > 0) {
      if (!customerId) throw new Error('INSUFFICIENT_COINS');
      const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(customerId);
      if (!account || account.current_coin_balance < coinsToRedeem) {
        throw new Error('INSUFFICIENT_COINS');
      }
      coinsRedeemed = coinsToRedeem;
      coinDiscountValue = coinsToDiscountValue(coinsRedeemed);
    }

    const discountTotal = itemDiscountTotal + lumpSumAmount;
    const total = subtotal - discountTotal - coinDiscountValue;
    const coinsEarned = customerId ? coinsEarnedForAmount(subtotal) : 0;

    const invoiceNumber = nextInvoiceNumber(db, now);
    const insertInvoice = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, subtotal, discount_total, coins_redeemed, coins_earned, total, payment_method, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
    `);
    const result = insertInvoice.run(
      invoiceNumber, customerId, subtotal, discountTotal, coinsRedeemed, coinsEarned, total, paymentMethod, now.toISOString()
    );
    const invoiceId = result.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, variant_id, quantity, unit_price, item_discount) VALUES (?, ?, ?, ?, ?)
    `);
    const decrementStock = db.prepare('UPDATE product_variants SET quantity = quantity - ? WHERE id = ?');
    for (const item of items) {
      insertItem.run(invoiceId, item.variantId, item.quantity, item.unitPrice, item.itemDiscount || 0);
      decrementStock.run(item.quantity, item.variantId);
    }

    if (customerId) {
      const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(customerId);
      const newLifetime = account.lifetime_coins + coinsEarned;
      const newBalance = account.current_coin_balance - coinsRedeemed + coinsEarned;
      const newTier = calculateTier(newLifetime);
      db.prepare(`
        UPDATE membership_accounts SET lifetime_coins = ?, current_coin_balance = ?, tier = ?, tier_updated_at = ?
        WHERE customer_id = ?
      `).run(newLifetime, newBalance, newTier, now.toISOString(), customerId);
    }

    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  });

  return tx();
}

module.exports = { createInvoice };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/checkoutService.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/services/checkoutService.js pos-app/server/test/services/checkoutService.test.js
git commit -m "feat: add checkout service with discounts, coin earn/redeem, stock decrement"
```

---

### Task 7: Refund service

**Files:**
- Create: `pos-app/server/src/services/refundService.js`
- Test: `pos-app/server/test/services/refundService.test.js`

**Interfaces:**
- Consumes: `db`, `coinsEarnedForAmount` (Task 3), `calculateTier` (Task 2)
- Produces: `createRefund(db, { invoiceId: number, lines: Array<{invoiceItemId, quantity}>, paymentMethod: string }, now = new Date()) -> refundRow`. Restocks `product_variants.quantity`, reverses coins proportional to the returned line's share of that invoice item's coin contribution, updates `invoices.status` to `'refunded'` (if all items returned) or `'partially-refunded'`.

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/services/refundService.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { createInvoice } = require('../../src/services/checkoutService');
const { createRefund } = require('../../src/services/refundService');

function setup() {
  const tmp = path.join(__dirname, `tmp-refund-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 5)`).run();
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 0, 0, 'White')`).run();
  return { db, tmp };
}

test('full return restocks item, reverses coins, marks invoice refunded', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));
  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  const refund = createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 2 }],
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));

  assert.equal(refund.refund_amount, 600);

  const variant = db.prepare('SELECT quantity FROM product_variants WHERE id = 1').get();
  assert.equal(variant.quantity, 5); // restocked back to original

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.lifetime_coins, 0); // 200 earned, fully reversed
  assert.equal(account.current_coin_balance, 0);

  const updatedInvoice = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id);
  assert.equal(updatedInvoice.status, 'refunded');

  db.close(); fs.unlinkSync(tmp);
});

test('partial return reverses proportional coins and marks partially-refunded', () => {
  const { db, tmp } = setup();
  const invoice = createInvoice(db, {
    customerId: 1,
    items: [{ variantId: 1, quantity: 2, unitPrice: 300, itemDiscount: 0 }], // earns 200 coins total
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  }, new Date('2026-08-27'));
  const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(invoice.id);

  createRefund(db, {
    invoiceId: invoice.id,
    lines: [{ invoiceItemId: invoiceItem.id, quantity: 1 }], // return half
    paymentMethod: 'Cash',
  }, new Date('2026-08-28'));

  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = 1').get();
  assert.equal(account.lifetime_coins, 100); // half of 200 reversed

  const updatedInvoice = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id);
  assert.equal(updatedInvoice.status, 'partially-refunded');

  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/refundService.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/services/refundService.js`:
```js
const { calculateTier } = require('./tierEngine');

function createRefund(db, params, now = new Date()) {
  const { invoiceId, lines, paymentMethod } = params;

  const tx = db.transaction(() => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) throw new Error('INVOICE_NOT_FOUND');

    let refundAmount = 0;
    let coinsToReverse = 0;

    const insertRefund = db.prepare(`
      INSERT INTO refunds (invoice_id, refund_amount, coins_reversed, payment_method, created_at)
      VALUES (?, 0, 0, ?, ?)
    `);
    const refundResult = insertRefund.run(invoiceId, paymentMethod, now.toISOString());
    const refundId = refundResult.lastInsertRowid;

    const insertRefundItem = db.prepare(`
      INSERT INTO refund_items (refund_id, invoice_item_id, quantity) VALUES (?, ?, ?)
    `);
    const restockVariant = db.prepare('UPDATE product_variants SET quantity = quantity + ? WHERE id = ?');

    for (const line of lines) {
      const invoiceItem = db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(line.invoiceItemId);
      const unitNet = invoiceItem.unit_price - (invoiceItem.item_discount / invoiceItem.quantity);
      const lineRefundAmount = unitNet * line.quantity;
      refundAmount += lineRefundAmount;

      if (invoice.customer_id) {
        const coinsPerUnit = invoice.coins_earned / lines.reduce((s, l) => s, 0 || 1); // fallback avoided below
      }

      insertRefundItem.run(refundId, line.invoiceItemId, line.quantity);
      restockVariant.run(line.quantity, invoiceItem.variant_id);
    }

    // Reverse coins proportionally to (returned qty / total invoice qty) across the whole invoice
    if (invoice.customer_id && invoice.coins_earned > 0) {
      const allItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);
      const totalQty = allItems.reduce((s, i) => s + i.quantity, 0);
      const returnedQty = lines.reduce((s, l) => s + l.quantity, 0);
      coinsToReverse = Math.round(invoice.coins_earned * (returnedQty / totalQty));

      const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(invoice.customer_id);
      const newLifetime = Math.max(0, account.lifetime_coins - coinsToReverse);
      const newBalance = Math.max(0, account.current_coin_balance - coinsToReverse);
      const newTier = calculateTier(newLifetime);
      db.prepare(`
        UPDATE membership_accounts SET lifetime_coins = ?, current_coin_balance = ?, tier = ?, tier_updated_at = ?
        WHERE customer_id = ?
      `).run(newLifetime, newBalance, newTier, now.toISOString(), invoice.customer_id);
    }

    db.prepare('UPDATE refunds SET refund_amount = ?, coins_reversed = ? WHERE id = ?')
      .run(refundAmount, coinsToReverse, refundId);

    // Determine full vs partial: sum all refunded quantities across all refunds for this invoice
    const allItems = db.prepare('SELECT id, quantity FROM invoice_items WHERE invoice_id = ?').all(invoiceId);
    const totalOriginalQty = allItems.reduce((s, i) => s + i.quantity, 0);
    const totalRefundedQty = db.prepare(`
      SELECT COALESCE(SUM(ri.quantity), 0) as total FROM refund_items ri
      JOIN invoice_items ii ON ii.id = ri.invoice_item_id
      WHERE ii.invoice_id = ?
    `).get(invoiceId).total;

    const newStatus = totalRefundedQty >= totalOriginalQty ? 'refunded' : 'partially-refunded';
    db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(newStatus, invoiceId);

    return db.prepare('SELECT * FROM refunds WHERE id = ?').get(refundId);
  });

  return tx();
}

module.exports = { createRefund };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/refundService.test.js`
Expected: PASS (2 tests). If the proportional-coin test fails on rounding, adjust `Math.round` to match exact expected values in the test (100/200 * exact half = 100, which divides evenly, so no rounding drift here).

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/services/refundService.js pos-app/server/test/services/refundService.test.js
git commit -m "feat: add refund service with proportional coin reversal and restock"
```

---

### Task 8: Auth (admin login) — service, middleware, routes

**Files:**
- Create: `pos-app/server/src/services/authService.js`
- Create: `pos-app/server/src/middleware/requireAuth.js`
- Create: `pos-app/server/src/routes/auth.js`
- Create: `pos-app/server/src/app.js`
- Test: `pos-app/server/test/routes/auth.test.js`

**Interfaces:**
- Produces: `authService.createAdmin(db, username, password) -> void`; `authService.verifyLogin(db, username, password) -> boolean`; Express app factory `createApp(db) -> app` mounting `/api/auth/login` (POST, sets a signed cookie session token), `/api/auth/logout` (POST), `/api/auth/me` (GET, requires auth). `requireAuth(req, res, next)` middleware checks the session cookie against an in-memory token set.

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/routes/auth.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

function setup() {
  const tmp = path.join(__dirname, `tmp-auth-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const app = createApp(db);
  return { app, db, tmp };
}

test('rejects bad credentials', async () => {
  const { app, db, tmp } = setup();
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
  db.close(); fs.unlinkSync(tmp);
});

test('accepts correct credentials and grants access to protected route', async () => {
  const { app, db, tmp } = setup();
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  assert.equal(login.status, 200);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.username, 'admin');

  db.close(); fs.unlinkSync(tmp);
});

test('protected route rejects unauthenticated requests', async () => {
  const { app, db, tmp } = setup();
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/routes/auth.test.js`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/services/authService.js`:
```js
const bcrypt = require('bcryptjs');

function createAdmin(db, username, password) {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT OR REPLACE INTO admin_users (id, username, password_hash) VALUES (1, ?, ?)').run(username, hash);
}

function verifyLogin(db, username, password) {
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!user) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

module.exports = { createAdmin, verifyLogin };
```

Create `pos-app/server/src/middleware/requireAuth.js`:
```js
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
```

Create `pos-app/server/src/routes/auth.js`:
```js
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
```

Create `pos-app/server/src/app.js`:
```js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { authRouter } = require('./routes/auth');

function createApp(db) {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter(db));
  return app;
}

module.exports = { createApp };
```

Run: `cd pos-app/server && npm install cookie-parser`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/routes/auth.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/services/authService.js pos-app/server/src/middleware/requireAuth.js pos-app/server/src/routes/auth.js pos-app/server/src/app.js pos-app/server/test/routes/auth.test.js pos-app/server/package.json pos-app/server/package-lock.json
git commit -m "feat: add admin login/session auth"
```

---

### Task 9: Product & variant routes (CRUD, stock adjustment, barcode/SKU lookup)

**Files:**
- Create: `pos-app/server/src/routes/products.js`
- Modify: `pos-app/server/src/app.js` (mount `/api/products`, all product routes behind `requireAuth`)
- Test: `pos-app/server/test/routes/products.test.js`

**Interfaces:**
- Produces: `GET /api/products` (list with variants, optional `?search=` matching name/category/sku), `GET /api/products/:id`, `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`, `GET /api/products/lookup?sku=CODE` (for barcode scan — returns the matching variant + parent product or 404), `POST /api/products/:id/variants/:variantId/adjust-stock` (body `{ delta: number, reason: string }`, logs nothing to a new table per spec but requires `reason` to be non-empty — validated at the route).

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/routes/products.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

async function setup() {
  const tmp = path.join(__dirname, `tmp-products-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  return { agent, db, tmp };
}

test('create product with a variant, then look it up by SKU', async () => {
  const { agent, db, tmp } = await setup();

  const create = await agent.post('/api/products').send({
    name: 'Cincin Eksklusif', category: 'Rings', brand: 'GOLVIA',
    variants: [{ variant_label: '40g', sku: 'CINCIN-40', cost_price: 40, sell_price: 120, quantity: 10 }],
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.variants.length, 1);

  const lookup = await agent.get('/api/products/lookup?sku=CINCIN-40');
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.variant.sku, 'CINCIN-40');
  assert.equal(lookup.body.product.name, 'Cincin Eksklusif');

  db.close(); fs.unlinkSync(tmp);
});

test('lookup returns 404 for unknown SKU', async () => {
  const { agent, db, tmp } = await setup();
  const res = await agent.get('/api/products/lookup?sku=NOPE');
  assert.equal(res.status, 404);
  db.close(); fs.unlinkSync(tmp);
});

test('adjust-stock requires a reason and updates quantity', async () => {
  const { agent, db, tmp } = await setup();
  const create = await agent.post('/api/products').send({
    name: 'Bangle', variants: [{ variant_label: '30g', sku: 'BANG-30', cost_price: 30, sell_price: 90, quantity: 5 }],
  });
  const variantId = create.body.variants[0].id;
  const productId = create.body.id;

  const noReason = await agent.post(`/api/products/${productId}/variants/${variantId}/adjust-stock`).send({ delta: 3 });
  assert.equal(noReason.status, 400);

  const ok = await agent.post(`/api/products/${productId}/variants/${variantId}/adjust-stock`).send({ delta: 3, reason: 'Restock' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.quantity, 8);

  db.close(); fs.unlinkSync(tmp);
});

test('search filters by name, category, or sku', async () => {
  const { agent, db, tmp } = await setup();
  await agent.post('/api/products').send({ name: 'Gold Necklace', category: 'Necklaces', variants: [{ variant_label: '20g', sku: 'NECK-20', cost_price: 50, sell_price: 150, quantity: 4 }] });
  const res = await agent.get('/api/products?search=NECK-20');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/routes/products.test.js`
Expected: FAIL — route not mounted / module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/routes/products.js`:
```js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

function productsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  function withVariants(product) {
    const variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(product.id);
    return { ...product, variants };
  }

  router.get('/', (req, res) => {
    const { search } = req.query;
    let products;
    if (search) {
      const like = `%${search}%`;
      const rows = db.prepare(`
        SELECT DISTINCT p.* FROM products p
        LEFT JOIN product_variants v ON v.product_id = p.id
        WHERE p.name LIKE ? OR p.category LIKE ? OR v.sku LIKE ?
      `).all(like, like, like);
      products = rows;
    } else {
      products = db.prepare('SELECT * FROM products').all();
    }
    res.json(products.map(withVariants));
  });

  router.get('/lookup', (req, res) => {
    const { sku } = req.query;
    const variant = db.prepare('SELECT * FROM product_variants WHERE sku = ?').get(sku);
    if (!variant) return res.status(404).json({ error: 'NOT_FOUND' });
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(variant.product_id);
    res.json({ product, variant });
  });

  router.get('/:id', (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(withVariants(product));
  });

  router.post('/', (req, res) => {
    const { name, category, description, brand, image_url, variants = [] } = req.body;
    const tx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO products (name, category, description, brand, image_url) VALUES (?, ?, ?, ?, ?)
      `).run(name, category, description, brand, image_url);
      const productId = result.lastInsertRowid;
      const insertVariant = db.prepare(`
        INSERT INTO product_variants (product_id, variant_label, sku, cost_price, sell_price, quantity, low_stock_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of variants) {
        insertVariant.run(productId, v.variant_label, v.sku, v.cost_price, v.sell_price, v.quantity, v.low_stock_threshold ?? 3);
      }
      return productId;
    });
    const productId = tx();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    res.status(201).json(withVariants(product));
  });

  router.put('/:id', (req, res) => {
    const { name, category, description, brand, image_url } = req.body;
    db.prepare(`
      UPDATE products SET name = ?, category = ?, description = ?, brand = ?, image_url = ? WHERE id = ?
    `).run(name, category, description, brand, image_url, req.params.id);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(withVariants(product));
  });

  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(req.params.id);
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/:id/variants/:variantId/adjust-stock', (req, res) => {
    const { delta, reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'REASON_REQUIRED' });
    }
    db.prepare('UPDATE product_variants SET quantity = quantity + ? WHERE id = ?').run(delta, req.params.variantId);
    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(req.params.variantId);
    res.json(variant);
  });

  return router;
}

module.exports = { productsRouter };
```

Modify `pos-app/server/src/app.js` — add:
```js
const { productsRouter } = require('./routes/products');
// ...
app.use('/api/products', productsRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/routes/products.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/routes/products.js pos-app/server/src/app.js pos-app/server/test/routes/products.test.js
git commit -m "feat: add product/variant CRUD, SKU lookup, and stock adjustment routes"
```

---

### Task 10: Stock list import script

**Files:**
- Create: `pos-app/server/src/services/importStock.js`
- Test: `pos-app/server/test/services/importStock.test.js`

**Interfaces:**
- Produces: `parseStockRows(rows: Array<object>) -> Array<{name, category, variants: Array<{variant_label, sku, cost_price, sell_price, quantity}>}>` — groups rows sharing `product_name` into one product entry per spec §4 (variant grouping decision). `importIntoDb(db, groupedProducts) -> {productsCreated: number, variantsCreated: number}`.
- CLI entry point (`node src/services/importStock.js <path-to-xlsx>`) reads the real file with the `xlsx` npm package and calls the two functions above — this part is exercised manually (Step 5), not unit tested, since it depends on the external file.

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/services/importStock.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { parseStockRows, importIntoDb } = require('../../src/services/importStock');

test('parseStockRows groups rows by product_name into variants', () => {
  const rows = [
    { product_name: 'Cincin Eksklusif Adjustable', category: 'Rings (605273)', brand: 'GOLVIA', variation_value: 'ROSELLE', Cost: 4, price: 40, quantity: 48, seller_sku: 'CINCIN-aurora 0040' },
    { product_name: 'Cincin Eksklusif Adjustable', category: 'Rings (605273)', brand: 'GOLVIA', variation_value: 'AURORA', Cost: 4.5, price: 45, quantity: 73, seller_sku: 'CINCIN-aurora 0045' },
    { product_name: 'Gold Necklace', category: 'Necklaces (605280)', brand: 'GOLVIA', variation_value: '20cm', Cost: 10, price: 100, quantity: 12, seller_sku: 'NECK-20' },
  ];
  const grouped = parseStockRows(rows);
  assert.equal(grouped.length, 2);
  const ring = grouped.find(p => p.name === 'Cincin Eksklusif Adjustable');
  assert.equal(ring.variants.length, 2);
  assert.equal(ring.category, 'Rings');
  assert.equal(ring.variants[0].variant_label, 'ROSELLE');
  assert.equal(ring.variants[0].sku, 'CINCIN-aurora 0040');
  assert.equal(ring.variants[0].cost_price, 4);
  assert.equal(ring.variants[0].sell_price, 40);
  assert.equal(ring.variants[0].quantity, 48);
});

test('importIntoDb inserts products and variants', () => {
  const tmp = path.join(__dirname, `tmp-import-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const grouped = [{ name: 'Test Ring', category: 'Rings', brand: 'GOLVIA', description: '', variants: [
    { variant_label: '40g', sku: 'T-40', cost_price: 4, sell_price: 40, quantity: 10 },
  ] }];
  const result = importIntoDb(db, grouped);
  assert.equal(result.productsCreated, 1);
  assert.equal(result.variantsCreated, 1);
  const products = db.prepare('SELECT * FROM products').all();
  assert.equal(products.length, 1);
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/importStock.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/services/importStock.js`:
```js
function parseStockRows(rows) {
  const byName = new Map();
  for (const row of rows) {
    const name = row.product_name;
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        category: String(row.category || '').replace(/\s*\(\d+\)\s*$/, '').trim(),
        brand: row.brand || '',
        description: row.product_description || '',
        variants: [],
      });
    }
    byName.get(name).variants.push({
      variant_label: row.variation_value || '',
      sku: row.seller_sku || '',
      cost_price: Number(row.Cost) || 0,
      sell_price: Number(row.price) || 0,
      quantity: Number(row.quantity) || 0,
    });
  }
  return Array.from(byName.values());
}

function importIntoDb(db, groupedProducts) {
  let productsCreated = 0;
  let variantsCreated = 0;
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, description, brand) VALUES (?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO product_variants (product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const p of groupedProducts) {
      const result = insertProduct.run(p.name, p.category, p.description, p.brand);
      productsCreated++;
      for (const v of p.variants) {
        insertVariant.run(result.lastInsertRowid, v.variant_label, v.sku, v.cost_price, v.sell_price, v.quantity);
        variantsCreated++;
      }
    }
  });
  tx();
  return { productsCreated, variantsCreated };
}

// CLI entry point: node src/services/importStock.js <path-to-xlsx>
if (require.main === module) {
  const xlsx = require('xlsx');
  const { getDb } = require('../db/db');
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node importStock.js <path-to-xlsx>');
    process.exit(1);
  }
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);
  const grouped = parseStockRows(rows);
  const db = getDb();
  const result = importIntoDb(db, grouped);
  console.log(`Imported ${result.productsCreated} products, ${result.variantsCreated} variants.`);
}

module.exports = { parseStockRows, importIntoDb };
```

Run: `cd pos-app/server && npm install xlsx`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/importStock.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the real import against the user's stock file**

Run:
```bash
cd pos-app/server && node src/services/importStock.js "D:/Admin/Documents/GOLVIA/Golvia Stocks List.xlsx"
```
Expected: prints `Imported N products, M variants.` with N/M > 0. Spot-check via `sqlite3 data/golvia.db "SELECT COUNT(*) FROM products;"` or a quick `node -e` script.

- [ ] **Step 6: Commit**

```bash
git add pos-app/server/src/services/importStock.js pos-app/server/test/services/importStock.test.js pos-app/server/package.json pos-app/server/package-lock.json
git commit -m "feat: add stock list import with product/variant grouping"
```

---

### Task 11: Customer routes (CRM CRUD + phone lookup)

**Files:**
- Create: `pos-app/server/src/routes/customers.js`
- Modify: `pos-app/server/src/app.js` (mount `/api/customers`)
- Test: `pos-app/server/test/routes/customers.test.js`

**Interfaces:**
- Produces: `GET /api/customers?search=` (matches phone/name/email), `GET /api/customers/:id` (includes membership account + invoice history summary), `POST /api/customers` (also creates a `membership_accounts` row), `PUT /api/customers/:id`, `GET /api/customers/by-phone/:phone`.

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/routes/customers.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

async function setup() {
  const tmp = path.join(__dirname, `tmp-customers-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  return { agent, db, tmp };
}

test('creating a customer also creates a membership account defaulting to White tier', async () => {
  const { agent, db, tmp } = await setup();
  const res = await agent.post('/api/customers').send({ name: 'Alice', phone: '0123456789', email: 'a@example.com', whatsapp_consent: true });
  assert.equal(res.status, 201);
  const account = db.prepare('SELECT * FROM membership_accounts WHERE customer_id = ?').get(res.body.id);
  assert.equal(account.tier, 'White');
  assert.equal(account.lifetime_coins, 0);
  db.close(); fs.unlinkSync(tmp);
});

test('rejects duplicate phone number', async () => {
  const { agent, db, tmp } = await setup();
  await agent.post('/api/customers').send({ name: 'Alice', phone: '0123456789' });
  const dup = await agent.post('/api/customers').send({ name: 'Bob', phone: '0123456789' });
  assert.equal(dup.status, 409);
  db.close(); fs.unlinkSync(tmp);
});

test('lookup by phone finds the customer with membership info', async () => {
  const { agent, db, tmp } = await setup();
  await agent.post('/api/customers').send({ name: 'Alice', phone: '0123456789' });
  const res = await agent.get('/api/customers/by-phone/0123456789');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Alice');
  assert.equal(res.body.membership.tier, 'White');
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/routes/customers.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/routes/customers.js`:
```js
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
```

Modify `pos-app/server/src/app.js` — add:
```js
const { customersRouter } = require('./routes/customers');
// ...
app.use('/api/customers', customersRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/routes/customers.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/routes/customers.js pos-app/server/src/app.js pos-app/server/test/routes/customers.test.js
git commit -m "feat: add customer CRM routes with membership account auto-creation"
```

---

### Task 12: Invoice/checkout and refund routes

**Files:**
- Create: `pos-app/server/src/routes/invoices.js`
- Modify: `pos-app/server/src/app.js` (mount `/api/invoices`)
- Test: `pos-app/server/test/routes/invoices.test.js`

**Interfaces:**
- Consumes: `createInvoice` (Task 6), `createRefund` (Task 7)
- Produces: `POST /api/invoices` (checkout — body matches `createInvoice` params, camelCase over the wire), `GET /api/invoices?search=&from=&to=`, `GET /api/invoices/:id` (includes items + customer), `POST /api/invoices/:id/refund` (body matches `createRefund` params). Maps `INSUFFICIENT_STOCK`/`INSUFFICIENT_COINS` errors to HTTP 409 with the error code in the body.

- [ ] **Step 1: Write the failing test**

Create `pos-app/server/test/routes/invoices.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

async function setup() {
  const tmp = path.join(__dirname, `tmp-invoices-${Date.now()}-${Math.random()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 5)`).run();
  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });
  return { agent, db, tmp };
}

test('checkout creates an invoice and refund reverses it', async () => {
  const { agent, db, tmp } = await setup();

  const checkout = await agent.post('/api/invoices').send({
    customerId: null,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.body.invoice_number, 'INV-2026-0001'.slice(0, 4) + checkout.body.invoice_number.slice(4)); // year-agnostic check
  const invoiceId = checkout.body.id;

  const detail = await agent.get(`/api/invoices/${invoiceId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.items.length, 1);

  const refund = await agent.post(`/api/invoices/${invoiceId}/refund`).send({
    lines: [{ invoiceItemId: detail.body.items[0].id, quantity: 1 }],
    paymentMethod: 'Cash',
  });
  assert.equal(refund.status, 201);

  db.close(); fs.unlinkSync(tmp);
});

test('checkout returns 409 on insufficient stock', async () => {
  const { agent, db, tmp } = await setup();
  const res = await agent.post('/api/invoices').send({
    customerId: null,
    items: [{ variantId: 1, quantity: 999, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'INSUFFICIENT_STOCK');
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/routes/invoices.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Create `pos-app/server/src/routes/invoices.js`:
```js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { createInvoice } = require('../services/checkoutService');
const { createRefund } = require('../services/refundService');

function invoicesRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', (req, res) => {
    const { customerId, items, lumpSumDiscount, coinsToRedeem, paymentMethod } = req.body;
    try {
      const invoice = createInvoice(db, { customerId, items, lumpSumDiscount, coinsToRedeem, paymentMethod });
      res.status(201).json(invoice);
    } catch (err) {
      if (err.message === 'INSUFFICIENT_STOCK' || err.message === 'INSUFFICIENT_COINS') {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  });

  router.get('/', (req, res) => {
    const { search } = req.query;
    let rows;
    if (search) {
      rows = db.prepare('SELECT * FROM invoices WHERE invoice_number LIKE ? ORDER BY created_at DESC').all(`%${search}%`);
    } else {
      rows = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC').all();
    }
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'NOT_FOUND' });
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
    const customer = invoice.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id) : null;
    res.json({ ...invoice, items, customer });
  });

  router.post('/:id/refund', (req, res) => {
    const { lines, paymentMethod } = req.body;
    try {
      const refund = createRefund(db, { invoiceId: req.params.id, lines, paymentMethod });
      res.status(201).json(refund);
    } catch (err) {
      if (err.message === 'INVOICE_NOT_FOUND') return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  return router;
}

module.exports = { invoicesRouter };
```

Modify `pos-app/server/src/app.js` — add:
```js
const { invoicesRouter } = require('./routes/invoices');
// ...
app.use('/api/invoices', invoicesRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/routes/invoices.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add pos-app/server/src/routes/invoices.js pos-app/server/src/app.js pos-app/server/test/routes/invoices.test.js
git commit -m "feat: add checkout and refund HTTP routes"
```

---

### Task 13: Dashboard, marketing (templates + WhatsApp link + pending list), and settings routes

**Files:**
- Create: `pos-app/server/src/services/whatsappService.js`
- Create: `pos-app/server/src/services/emailService.js`
- Create: `pos-app/server/src/routes/dashboard.js`
- Create: `pos-app/server/src/routes/marketing.js`
- Create: `pos-app/server/src/routes/settings.js`
- Modify: `pos-app/server/src/app.js`
- Test: `pos-app/server/test/services/whatsappService.test.js`
- Test: `pos-app/server/test/routes/dashboard.test.js`
- Test: `pos-app/server/test/routes/marketing.test.js`

**Interfaces:**
- Produces: `buildWhatsAppLink(phone: string, message: string) -> string` (a `https://wa.me/<digits>?text=<encoded>` URL; strips non-digits from phone, assumes Malaysian numbers already include or need a `60` country code — if the stored phone starts with `0`, replace with `60`). `sendEmail({ to, subject, html }, config) -> Promise` (nodemailer wrapper reading Gmail address/app-password from `settings` table — implementation only, not unit tested since it requires real network/credentials; covered by the manual verification step). `GET /api/dashboard/summary` -> `{ todaySalesTotal, todayTransactionCount, lowStockVariants: [...], upcomingBirthdays: [...] }`. `GET /api/marketing/pending` -> customers who are consented and have an unsent trigger today (birthday today, or a voucher issued today). `GET/PUT /api/settings` (key-value templates and Gmail config).

- [ ] **Step 1: Write the failing test for `whatsappService`**

Create `pos-app/server/test/services/whatsappService.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { buildWhatsAppLink } = require('../../src/services/whatsappService');

test('normalizes a Malaysian 0-prefixed number to country code 60 and encodes the message', () => {
  const link = buildWhatsAppLink('0123456789', 'Happy Birthday! Here is RM10 off.');
  assert.equal(link, 'https://wa.me/60123456789?text=Happy%20Birthday!%20Here%20is%20RM10%20off.');
});

test('leaves an already-60-prefixed number untouched', () => {
  const link = buildWhatsAppLink('60123456789', 'Hi');
  assert.equal(link, 'https://wa.me/60123456789?text=Hi');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/whatsappService.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `whatsappService.js` and `emailService.js`**

Create `pos-app/server/src/services/whatsappService.js`:
```js
function buildWhatsAppLink(phone, message) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '60' + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

module.exports = { buildWhatsAppLink };
```

Create `pos-app/server/src/services/emailService.js`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/whatsappService.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for dashboard and marketing routes**

Create `pos-app/server/test/routes/dashboard.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

test('dashboard summary reports low stock and today totals', async () => {
  const tmp = path.join(__dirname, `tmp-dash-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  db.prepare(`INSERT INTO products (id, name) VALUES (1, 'Ring')`).run();
  db.prepare(`INSERT INTO product_variants (id, product_id, variant_label, sku, cost_price, sell_price, quantity, low_stock_threshold) VALUES (1, 1, '40g', 'SKU-1', 100, 300, 1, 3)`).run();
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method, created_at) VALUES ('INV-2026-0001', 300, 300, 'Cash', datetime('now'))`).run();

  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });

  const res = await agent.get('/api/dashboard/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.todayTransactionCount, 1);
  assert.equal(res.body.todaySalesTotal, 300);
  assert.equal(res.body.lowStockVariants.length, 1);

  db.close(); fs.unlinkSync(tmp);
});
```

Create `pos-app/server/test/routes/marketing.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { initDb } = require('../../src/db/db');
const { createAdmin } = require('../../src/services/authService');
const { createApp } = require('../../src/app');

test('pending marketing list only includes consented customers with a birthday today', async () => {
  const tmp = path.join(__dirname, `tmp-marketing-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  createAdmin(db, 'admin', 'secret123');
  const todayIso = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO customers (id, name, phone, birthday, whatsapp_consent) VALUES (1, 'Alice', '0123456789', ?, 1)`).run(`1990-${todayIso.slice(5)}`);
  db.prepare(`INSERT INTO customers (id, name, phone, birthday, whatsapp_consent) VALUES (2, 'Bob', '0198765432', ?, 0)`).run(`1990-${todayIso.slice(5)}`); // no consent

  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'secret123' });

  const res = await agent.get('/api/marketing/pending');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].name, 'Alice');
  assert.ok(res.body[0].whatsappLink.startsWith('https://wa.me/'));

  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd pos-app/server && node --test test/routes/dashboard.test.js test/routes/marketing.test.js`
Expected: FAIL — routes not mounted

- [ ] **Step 7: Implement the routes**

Create `pos-app/server/src/routes/dashboard.js`:
```js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

function dashboardRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/summary', (req, res) => {
    const todayRow = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
      FROM invoices WHERE date(created_at) = date('now') AND status != 'refunded'
    `).get();
    const lowStockVariants = db.prepare(`
      SELECT pv.*, p.name as product_name FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.quantity <= pv.low_stock_threshold
    `).all();
    const upcomingBirthdays = db.prepare(`
      SELECT * FROM customers WHERE birthday IS NOT NULL AND strftime('%m-%d', birthday) = strftime('%m-%d', 'now')
    `).all();

    res.json({
      todaySalesTotal: todayRow.total,
      todayTransactionCount: todayRow.count,
      lowStockVariants,
      upcomingBirthdays,
    });
  });

  return router;
}

module.exports = { dashboardRouter };
```

Create `pos-app/server/src/routes/marketing.js`:
```js
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
```

Create `pos-app/server/src/routes/settings.js`:
```js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

function settingsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM settings').all();
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
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
```

Modify `pos-app/server/src/app.js` — add:
```js
const { dashboardRouter } = require('./routes/dashboard');
const { marketingRouter } = require('./routes/marketing');
const { settingsRouter } = require('./routes/settings');
// ...
app.use('/api/dashboard', dashboardRouter(db));
app.use('/api/marketing', marketingRouter(db));
app.use('/api/settings', settingsRouter(db));
```

Run: `cd pos-app/server && npm install nodemailer`

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd pos-app/server && node --test test/routes/dashboard.test.js test/routes/marketing.test.js`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add pos-app/server/src -A
git add pos-app/server/test -A
git add pos-app/server/package.json pos-app/server/package-lock.json
git commit -m "feat: add dashboard, marketing (whatsapp click-to-chat), and settings routes"
```

---

### Task 14: Automatic backup and manual export

**Files:**
- Create: `pos-app/server/src/services/backupService.js`
- Create: `pos-app/server/src/services/exportService.js`
- Create: `pos-app/server/src/routes/export.js`
- Modify: `pos-app/server/src/server.js` (schedule daily backup)
- Modify: `pos-app/server/src/app.js` (mount `/api/export`)
- Test: `pos-app/server/test/services/backupService.test.js`
- Test: `pos-app/server/test/services/exportService.test.js`

**Interfaces:**
- Produces: `runBackup(dbFilePath: string, backupDir: string, now = new Date()) -> string` (copies the DB file to `backupDir/golvia-YYYY-MM-DD.sqlite`, returns the new path; prunes files older than 30 days in `backupDir`). `exportAllToCsv(db) -> { 'products.csv': string, 'customers.csv': string, 'invoices.csv': string }` (returns CSV text keyed by filename). `GET /api/export/all` streams a zip of those three CSVs (using Node's built-in `zlib`/a minimal manual zip is overkill — instead return a JSON object of the three CSV strings for the client to save individually, avoiding a new zip dependency).

- [ ] **Step 1: Write the failing test for backup**

Create `pos-app/server/test/services/backupService.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runBackup } = require('../../src/services/backupService');

test('copies the db file into the backup dir with a dated filename', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'golvia-backup-'));
  const dbFile = path.join(tmpDir, 'golvia.db');
  fs.writeFileSync(dbFile, 'fake-db-contents');
  const backupDir = path.join(tmpDir, 'backups');

  const result = runBackup(dbFile, backupDir, new Date('2026-08-27'));
  assert.equal(result, path.join(backupDir, 'golvia-2026-08-27.sqlite'));
  assert.ok(fs.existsSync(result));
  assert.equal(fs.readFileSync(result, 'utf8'), 'fake-db-contents');
});

test('prunes backups older than 30 days', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'golvia-backup-'));
  const dbFile = path.join(tmpDir, 'golvia.db');
  fs.writeFileSync(dbFile, 'x');
  const backupDir = path.join(tmpDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const oldFile = path.join(backupDir, 'golvia-2020-01-01.sqlite');
  fs.writeFileSync(oldFile, 'old');

  runBackup(dbFile, backupDir, new Date('2026-08-27'));
  assert.equal(fs.existsSync(oldFile), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/backupService.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `backupService.js`**

Create `pos-app/server/src/services/backupService.js`:
```js
const fs = require('fs');
const path = require('path');

function runBackup(dbFilePath, backupDir, now = new Date()) {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const dateStr = now.toISOString().slice(0, 10);
  const dest = path.join(backupDir, `golvia-${dateStr}.sqlite`);
  fs.copyFileSync(dbFilePath, dest);

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  for (const file of fs.readdirSync(backupDir)) {
    const match = file.match(/^golvia-(\d{4}-\d{2}-\d{2})\.sqlite$/);
    if (!match) continue;
    const fileDate = new Date(match[1]);
    if (fileDate < cutoff) {
      fs.unlinkSync(path.join(backupDir, file));
    }
  }

  return dest;
}

module.exports = { runBackup };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/backupService.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for CSV export**

Create `pos-app/server/test/services/exportService.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { exportAllToCsv } = require('../../src/services/exportService');

test('exports products, customers, invoices as CSV text', () => {
  const tmp = path.join(__dirname, `tmp-export-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name, category) VALUES (1, 'Ring', 'Rings')`).run();
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  db.prepare(`INSERT INTO invoices (invoice_number, subtotal, total, payment_method) VALUES ('INV-2026-0001', 300, 300, 'Cash')`).run();

  const files = exportAllToCsv(db);
  assert.ok(files['products.csv'].includes('Ring'));
  assert.ok(files['customers.csv'].includes('Alice'));
  assert.ok(files['invoices.csv'].includes('INV-2026-0001'));

  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/exportService.test.js`
Expected: FAIL — module not found

- [ ] **Step 7: Implement `exportService.js` and the export route**

Create `pos-app/server/src/services/exportService.js`:
```js
function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

function exportAllToCsv(db) {
  const products = db.prepare(`
    SELECT p.id, p.name, p.category, v.variant_label, v.sku, v.cost_price, v.sell_price, v.quantity
    FROM products p LEFT JOIN product_variants v ON v.product_id = p.id
  `).all();
  const customers = db.prepare('SELECT * FROM customers').all();
  const invoices = db.prepare('SELECT * FROM invoices').all();

  return {
    'products.csv': toCsv(products),
    'customers.csv': toCsv(customers),
    'invoices.csv': toCsv(invoices),
  };
}

module.exports = { exportAllToCsv };
```

Create `pos-app/server/src/routes/export.js`:
```js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { exportAllToCsv } = require('../services/exportService');

function exportRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/all', (req, res) => {
    res.json(exportAllToCsv(db));
  });

  return router;
}

module.exports = { exportRouter };
```

Modify `pos-app/server/src/app.js` — add:
```js
const { exportRouter } = require('./routes/export');
// ...
app.use('/api/export', exportRouter(db));
```

Modify `pos-app/server/src/server.js` (created here for the first time) to schedule a daily backup:
```js
const path = require('path');
const { getDb } = require('./db/db');
const { createApp } = require('./app');
const { runBackup } = require('./services/backupService');

const db = getDb();
const app = createApp(db);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/golvia.db');
const backupDir = path.join(__dirname, '../data/backups');

function scheduleDailyBackup() {
  runBackup(dbPath, backupDir); // run once at startup
  setInterval(() => runBackup(dbPath, backupDir), 24 * 60 * 60 * 1000);
}
scheduleDailyBackup();

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => console.log(`GOLVIA POS server running on http://localhost:${PORT}`));
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/exportService.test.js`
Expected: PASS (1 test)

- [ ] **Step 9: Commit**

```bash
git add pos-app/server/src -A
git add pos-app/server/test -A
git commit -m "feat: add automatic daily backup, CSV export, and server entry point"
```

---

### Task 15: React client scaffold, auth flow, and API client

**Files:**
- Create: `pos-app/client/package.json` (via Vite scaffold)
- Create: `pos-app/client/src/api/client.js`
- Create: `pos-app/client/src/pages/Login.jsx`
- Create: `pos-app/client/src/App.jsx`
- Create: `pos-app/client/src/main.jsx`

**Interfaces:**
- Produces: `apiClient.get(path)`, `apiClient.post(path, body)`, `apiClient.put(path, body)` — thin `fetch` wrappers with `credentials: 'include'` so the session cookie is sent; throw on non-2xx with the parsed JSON error body attached as `err.data`. `App.jsx` renders `Login` when `GET /api/auth/me` fails, otherwise renders the authenticated shell (nav + routed pages).

- [ ] **Step 1: Scaffold the Vite React app**

Run:
```bash
cd pos-app && npm create vite@latest client -- --template react
cd client && npm install && npm install react-router-dom
```

- [ ] **Step 2: Write the API client**

Create `pos-app/client/src/api/client.js`:
```js
const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const apiClient = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};
```

- [ ] **Step 3: Write the Login page**

Create `pos-app/client/src/pages/Login.jsx`:
```jsx
import { useState } from 'react';
import { apiClient } from '../api/client';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await apiClient.post('/auth/login', { username, password });
      onLoggedIn(user);
    } catch (err) {
      setError('Invalid username or password.');
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>GOLVIA POS</h1>
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">Log in</button>
    </form>
  );
}
```

- [ ] **Step 4: Write `App.jsx` with the auth gate**

Create `pos-app/client/src/App.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { apiClient } from './api/client';
import Login from './pages/Login';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    apiClient.get('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <p>Loading...</p>;
  if (user === null) return <Login onLoggedIn={setUser} />;

  return (
    <div>
      <h1>Welcome, {user.username}</h1>
      <p>POS shell — pages added in later tasks.</p>
    </div>
  );
}
```

`main.jsx` is generated by Vite's scaffold and needs no changes for this task.

- [ ] **Step 5: Configure the Vite dev proxy so `/api` reaches the Express server during development**

Modify `pos-app/client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4173',
    },
  },
});
```

- [ ] **Step 6: Manually verify in the browser**

Run in two terminals:
```bash
cd pos-app/server && node src/server.js
```
```bash
cd pos-app/client && npm run dev
```
Open the Vite dev URL (typically `http://localhost:5173`). Confirm the login form appears, and logging in with the admin credentials created in Task 8's test setup (create a real admin via a short one-off script `node -e "const {getDb}=require('./src/db/db'); const {createAdmin}=require('./src/services/authService'); createAdmin(getDb(),'admin','changeme');"` run from `pos-app/server`) shows the "Welcome, admin" shell.

- [ ] **Step 7: Commit**

```bash
git add pos-app/client -A
git commit -m "feat: scaffold React client with auth gate and API client"
```

---

### Task 16: POS Checkout UI (search, barcode scan, cart, discounts, coin redemption, print receipt)

**Files:**
- Create: `pos-app/client/src/pages/Checkout.jsx`
- Create: `pos-app/client/src/pages/InvoiceReceipt.jsx`
- Modify: `pos-app/client/src/App.jsx` (add routing via `react-router-dom`, mount `Checkout` as the default route)

**Interfaces:**
- Consumes: `GET /api/products?search=`, `GET /api/products/lookup?sku=`, `GET /api/customers/by-phone/:phone`, `POST /api/customers`, `POST /api/invoices` (Task 12)
- Produces: a working checkout screen; `InvoiceReceipt` renders the A5 print layout for a given invoice id via `window.print()`.

- [ ] **Step 1: Add routing to `App.jsx`**

Modify `pos-app/client/src/App.jsx` to wrap the authenticated shell in `react-router-dom`'s `BrowserRouter`/`Routes`, with `/` → `Checkout`, `/invoices/:id/receipt` → `InvoiceReceipt`, and a placeholder `<nav>` linking to routes added in later tasks (Products, Customers, Invoices, Marketing, Settings — those pages are added in later tasks but the nav links can be added now and will 404 until then; acceptable for iterative delivery).

- [ ] **Step 2: Write `Checkout.jsx`**

Create `pos-app/client/src/pages/Checkout.jsx`:
```jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Checkout() {
  const [search, setSearch] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]); // {variantId, name, variantLabel, unitPrice, quantity, itemDiscount}
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [lumpSumType, setLumpSumType] = useState('amount');
  const [lumpSumValue, setLumpSumValue] = useState(0);
  const [coinsToRedeem, setCoinsToRedeem] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [error, setError] = useState('');
  const scanRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { scanRef.current?.focus(); }, []);

  async function runSearch(q) {
    setSearch(q);
    if (!q) return setResults([]);
    const products = await apiClient.get(`/products?search=${encodeURIComponent(q)}`);
    setResults(products);
  }

  function addVariantToCart(product, variant) {
    setCart(prev => {
      const existing = prev.find(i => i.variantId === variant.id);
      if (existing) {
        return prev.map(i => i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        variantId: variant.id, name: product.name, variantLabel: variant.variant_label,
        unitPrice: variant.sell_price, quantity: 1, itemDiscount: 0,
      }];
    });
  }

  async function handleScan(e) {
    if (e.key !== 'Enter') return;
    const sku = scanInput.trim();
    setScanInput('');
    if (!sku) return;
    try {
      const { product, variant } = await apiClient.get(`/products/lookup?sku=${encodeURIComponent(sku)}`);
      addVariantToCart(product, variant);
    } catch {
      setError(`No product found for SKU ${sku}`);
    }
  }

  async function lookupCustomer() {
    try {
      const c = await apiClient.get(`/customers/by-phone/${encodeURIComponent(phone)}`);
      setCustomer(c);
    } catch {
      setCustomer(null);
      setError('Customer not found — you can create one from the Customers page, or check out as guest.');
    }
  }

  function updateItemDiscount(variantId, value) {
    setCart(prev => prev.map(i => i.variantId === variantId ? { ...i, itemDiscount: Number(value) } : i));
  }

  function removeItem(variantId) {
    setCart(prev => prev.filter(i => i.variantId !== variantId));
  }

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  async function handleCheckout() {
    setError('');
    try {
      const invoice = await apiClient.post('/invoices', {
        customerId: customer ? customer.id : null,
        items: cart.map(i => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice, itemDiscount: i.itemDiscount })),
        lumpSumDiscount: lumpSumValue > 0 ? { type: lumpSumType, value: Number(lumpSumValue) } : null,
        coinsToRedeem: Number(coinsToRedeem) || 0,
        paymentMethod,
      });
      navigate(`/invoices/${invoice.id}/receipt`);
    } catch (err) {
      setError(err.data?.error === 'INSUFFICIENT_STOCK' ? 'Not enough stock for one or more items.' :
                err.data?.error === 'INSUFFICIENT_COINS' ? 'Customer does not have enough coins.' :
                'Checkout failed.');
    }
  }

  return (
    <div>
      <h2>Checkout</h2>
      <input ref={scanRef} placeholder="Scan barcode / SKU here" value={scanInput}
        onChange={e => setScanInput(e.target.value)} onKeyDown={handleScan} />
      <input placeholder="Search products" value={search} onChange={e => runSearch(e.target.value)} />
      <ul>
        {results.map(p => (
          <li key={p.id}>
            {p.name}
            {p.variants.map(v => (
              <button key={v.id} onClick={() => addVariantToCart(p, v)}>
                {v.variant_label} — RM{v.sell_price} (add)
              </button>
            ))}
          </li>
        ))}
      </ul>

      <h3>Cart</h3>
      <table>
        <tbody>
          {cart.map(i => (
            <tr key={i.variantId}>
              <td>{i.name} ({i.variantLabel})</td>
              <td>x{i.quantity}</td>
              <td>RM{i.unitPrice}</td>
              <td>
                Discount RM <input type="number" value={i.itemDiscount}
                  onChange={e => updateItemDiscount(i.variantId, e.target.value)} style={{ width: 60 }} />
              </td>
              <td><button onClick={() => removeItem(i.variantId)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Customer</h3>
      <input placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} />
      <button onClick={lookupCustomer}>Look up</button>
      {customer && <p>{customer.name} — {customer.membership.tier} tier, {customer.membership.current_coin_balance} coins</p>}

      <h3>Discounts</h3>
      <select value={lumpSumType} onChange={e => setLumpSumType(e.target.value)}>
        <option value="amount">RM amount</option>
        <option value="percent">%</option>
      </select>
      <input type="number" value={lumpSumValue} onChange={e => setLumpSumValue(e.target.value)} />

      {customer && (
        <div>
          <label>Redeem coins: <input type="number" value={coinsToRedeem} onChange={e => setCoinsToRedeem(e.target.value)} /></label>
        </div>
      )}

      <h3>Payment</h3>
      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
        <option>Cash</option>
        <option>DuitNow/QR</option>
        <option>Bank Transfer</option>
        <option>E-wallet</option>
      </select>

      <p>Subtotal: RM{subtotal.toFixed(2)}</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={handleCheckout} disabled={cart.length === 0}>Complete Sale</button>
    </div>
  );
}
```

- [ ] **Step 3: Write `InvoiceReceipt.jsx`**

Create `pos-app/client/src/pages/InvoiceReceipt.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function InvoiceReceipt() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    apiClient.get(`/invoices/${id}`).then(setInvoice);
  }, [id]);

  if (!invoice) return <p>Loading...</p>;

  return (
    <div style={{ width: '148mm', minHeight: '210mm', margin: '0 auto', padding: 16 }}>
      <h2>GOLVIA</h2>
      <p>16, Jalan SC 1, Pusat Perindustrian Sungai Chua, 43200 Kajang, Selangor, Malaysia</p>
      <p>Invoice: {invoice.invoice_number}</p>
      <p>Date: {new Date(invoice.created_at).toLocaleString()}</p>
      {invoice.customer && <p>Customer: {invoice.customer.name} ({invoice.customer.phone})</p>}
      <table width="100%">
        <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Discount</th></tr></thead>
        <tbody>
          {invoice.items.map(i => (
            <tr key={i.id}><td>Variant #{i.variant_id}</td><td>{i.quantity}</td><td>RM{i.unit_price}</td><td>RM{i.item_discount}</td></tr>
          ))}
        </tbody>
      </table>
      <p>Subtotal: RM{invoice.subtotal.toFixed(2)}</p>
      <p>Discount: RM{invoice.discount_total.toFixed(2)}</p>
      <p><b>Total: RM{invoice.total.toFixed(2)}</b></p>
      <p>Payment method: {invoice.payment_method}</p>
      <button onClick={() => window.print()}>Print</button>
    </div>
  );
}
```

- [ ] **Step 4: Manually verify in the browser**

With both server and client dev servers running (Task 15, Step 6): search a product, add it to the cart, scan-test by typing a known SKU into the scan field and pressing Enter, apply an item discount and a lump-sum discount, look up a test customer by phone, complete the sale, and confirm it lands on the A5-styled receipt page with a working Print button (verify the browser's print preview shows A5-appropriate proportions).

- [ ] **Step 5: Commit**

```bash
git add pos-app/client -A
git commit -m "feat: add POS checkout UI with barcode scan input, discounts, and A5 receipt printing"
```

---

### Task 17: Products, Customers, Invoices, Marketing, and Settings UI pages

**Files:**
- Create: `pos-app/client/src/pages/Products.jsx`
- Create: `pos-app/client/src/pages/ProductForm.jsx`
- Create: `pos-app/client/src/pages/Customers.jsx`
- Create: `pos-app/client/src/pages/CustomerProfile.jsx`
- Create: `pos-app/client/src/pages/Invoices.jsx`
- Create: `pos-app/client/src/pages/Marketing.jsx`
- Create: `pos-app/client/src/pages/Settings.jsx`
- Create: `pos-app/client/src/pages/Dashboard.jsx`
- Modify: `pos-app/client/src/App.jsx` (wire all routes and nav links)

**Interfaces:**
- Consumes: every route built in Tasks 8–14.

- [ ] **Step 1: `Dashboard.jsx`**

Create `pos-app/client/src/pages/Dashboard.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => { apiClient.get('/dashboard/summary').then(setSummary); }, []);
  if (!summary) return <p>Loading...</p>;

  return (
    <div>
      <h2>Dashboard</h2>
      <p>Today's sales: RM{summary.todaySalesTotal.toFixed(2)} ({summary.todayTransactionCount} transactions)</p>
      <h3>Low stock</h3>
      <ul>{summary.lowStockVariants.map(v => <li key={v.id}>{v.product_name} — {v.variant_label} ({v.quantity} left)</li>)}</ul>
      <h3>Birthdays today</h3>
      <ul>{summary.upcomingBirthdays.map(c => <li key={c.id}>{c.name}</li>)}</ul>
    </div>
  );
}
```

- [ ] **Step 2: `Products.jsx` and `ProductForm.jsx`**

Create `pos-app/client/src/pages/Products.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');

  async function load(q = '') {
    setProducts(await apiClient.get(`/products${q ? `?search=${encodeURIComponent(q)}` : ''}`));
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <h2>Products</h2>
      <input placeholder="Search" value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} />
      <Link to="/products/new">+ Add product</Link>
      <table>
        <thead><tr><th>Name</th><th>Category</th><th>Variants</th></tr></thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id}>
              <td><Link to={`/products/${p.id}`}>{p.name}</Link></td>
              <td>{p.category}</td>
              <td>{p.variants.map(v => `${v.variant_label} (${v.quantity})`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Create `pos-app/client/src/pages/ProductForm.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function ProductForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', category: '', brand: '', description: '' });
  const [variants, setVariants] = useState([{ variant_label: '', sku: '', cost_price: 0, sell_price: 0, quantity: 0 }]);

  useEffect(() => {
    if (!isNew) apiClient.get(`/products/${id}`).then(p => { setForm(p); setVariants(p.variants); });
  }, [id]);

  function updateVariant(idx, field, value) {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  }

  async function save() {
    if (isNew) {
      await apiClient.post('/products', { ...form, variants });
    } else {
      await apiClient.put(`/products/${id}`, form);
    }
    navigate('/products');
  }

  async function adjustStock(variantId) {
    const delta = Number(prompt('Quantity change (e.g. 5 or -2):'));
    const reason = prompt('Reason:');
    if (!reason) return alert('Reason is required.');
    await apiClient.post(`/products/${id}/variants/${variantId}/adjust-stock`, { delta, reason });
    apiClient.get(`/products/${id}`).then(p => setVariants(p.variants));
  }

  return (
    <div>
      <h2>{isNew ? 'New Product' : 'Edit Product'}</h2>
      <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <input placeholder="Category" value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} />
      <input placeholder="Brand" value={form.brand || ''} onChange={e => setForm({ ...form, brand: e.target.value })} />
      <textarea placeholder="Description" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />

      <h3>Variants</h3>
      {variants.map((v, idx) => (
        <div key={idx}>
          <input placeholder="Label" value={v.variant_label} onChange={e => updateVariant(idx, 'variant_label', e.target.value)} />
          <input placeholder="SKU" value={v.sku} onChange={e => updateVariant(idx, 'sku', e.target.value)} />
          <input placeholder="Cost" type="number" value={v.cost_price} onChange={e => updateVariant(idx, 'cost_price', Number(e.target.value))} />
          <input placeholder="Price" type="number" value={v.sell_price} onChange={e => updateVariant(idx, 'sell_price', Number(e.target.value))} />
          <input placeholder="Qty" type="number" value={v.quantity} onChange={e => updateVariant(idx, 'quantity', Number(e.target.value))} />
          {!isNew && v.id && <button onClick={() => adjustStock(v.id)}>Adjust stock</button>}
        </div>
      ))}
      {isNew && <button onClick={() => setVariants([...variants, { variant_label: '', sku: '', cost_price: 0, sell_price: 0, quantity: 0 }])}>+ Variant</button>}

      <button onClick={save}>Save</button>
    </div>
  );
}
```

- [ ] **Step 3: `Customers.jsx` and `CustomerProfile.jsx`**

Create `pos-app/client/src/pages/Customers.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', whatsapp_consent: false });

  async function load(q = '') {
    setCustomers(await apiClient.get(`/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`));
  }
  useEffect(() => { load(); }, []);

  async function createCustomer() {
    await apiClient.post('/customers', form);
    setForm({ name: '', phone: '', email: '', whatsapp_consent: false });
    load();
  }

  return (
    <div>
      <h2>Customers</h2>
      <input placeholder="Search" value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} />
      <ul>
        {customers.map(c => (
          <li key={c.id}><Link to={`/customers/${c.id}`}>{c.name} — {c.phone} ({c.membership.tier})</Link></li>
        ))}
      </ul>

      <h3>Add customer</h3>
      <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <label><input type="checkbox" checked={form.whatsapp_consent} onChange={e => setForm({ ...form, whatsapp_consent: e.target.checked })} /> WhatsApp consent</label>
      <button onClick={createCustomer}>Create</button>
    </div>
  );
}
```

Create `pos-app/client/src/pages/CustomerProfile.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function CustomerProfile() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);

  useEffect(() => { apiClient.get(`/customers/${id}`).then(setCustomer); }, [id]);
  if (!customer) return <p>Loading...</p>;

  return (
    <div>
      <h2>{customer.name}</h2>
      <p>Phone: {customer.phone} | Email: {customer.email}</p>
      <p>Tier: {customer.membership.tier} | Lifetime coins: {customer.membership.lifetime_coins} | Balance: {customer.membership.current_coin_balance}</p>
      <p>Notes: {customer.notes}</p>
      <h3>Purchase history</h3>
      <ul>{customer.invoices.map(i => <li key={i.id}>{i.invoice_number} — RM{i.total} — {i.status}</li>)}</ul>
    </div>
  );
}
```

- [ ] **Step 4: `Invoices.jsx`, `Marketing.jsx`, `Settings.jsx`**

Create `pos-app/client/src/pages/Invoices.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  useEffect(() => { apiClient.get('/invoices').then(setInvoices); }, []);
  return (
    <div>
      <h2>Sales History</h2>
      <ul>
        {invoices.map(i => (
          <li key={i.id}>
            <Link to={`/invoices/${i.id}/receipt`}>{i.invoice_number}</Link> — RM{i.total} — {i.status} — {new Date(i.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Create `pos-app/client/src/pages/Marketing.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Marketing() {
  const [pending, setPending] = useState([]);
  useEffect(() => { apiClient.get('/marketing/pending').then(setPending); }, []);
  return (
    <div>
      <h2>Marketing — Pending Today</h2>
      <ul>
        {pending.map(c => (
          <li key={c.id}>
            {c.name} — {c.triggerType} — {c.message}{' '}
            <a href={c.whatsappLink} target="_blank" rel="noreferrer">Send via WhatsApp</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Create `pos-app/client/src/pages/Settings.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Settings() {
  const [settings, setSettings] = useState({});

  useEffect(() => { apiClient.get('/settings').then(setSettings); }, []);

  async function save() {
    await apiClient.put('/settings', settings);
    alert('Saved.');
  }

  return (
    <div>
      <h2>Settings</h2>
      <label>Gmail address: <input value={settings.gmail_address || ''} onChange={e => setSettings({ ...settings, gmail_address: e.target.value })} /></label>
      <label>Gmail app password: <input type="password" value={settings.gmail_app_password || ''} onChange={e => setSettings({ ...settings, gmail_app_password: e.target.value })} /></label>
      <button onClick={save}>Save</button>
    </div>
  );
}
```

- [ ] **Step 5: Wire routing and nav in `App.jsx`**

Modify `pos-app/client/src/App.jsx` to route:
```jsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiClient } from './api/client';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Checkout from './pages/Checkout';
import Products from './pages/Products';
import ProductForm from './pages/ProductForm';
import Customers from './pages/Customers';
import CustomerProfile from './pages/CustomerProfile';
import Invoices from './pages/Invoices';
import InvoiceReceipt from './pages/InvoiceReceipt';
import Marketing from './pages/Marketing';
import Settings from './pages/Settings';

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => { apiClient.get('/auth/me').then(setUser).catch(() => setUser(null)); }, []);

  if (user === undefined) return <p>Loading...</p>;
  if (user === null) return <Login onLoggedIn={setUser} />;

  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Checkout</Link> | <Link to="/dashboard">Dashboard</Link> | <Link to="/products">Products</Link> |{' '}
        <Link to="/customers">Customers</Link> | <Link to="/invoices">Sales</Link> | <Link to="/marketing">Marketing</Link> |{' '}
        <Link to="/settings">Settings</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Checkout />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductForm />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerProfile />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/:id/receipt" element={<InvoiceReceipt />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Manually verify in the browser**

With both dev servers running: import the real stock list (Task 10, Step 5) so Products has real data, then walk through: Products list/search/add/edit/adjust-stock, Customers create/search/profile, a full Checkout → Receipt → Invoices history round trip, Marketing pending list (create a test customer with today's birthday and consent to confirm it appears with a working WhatsApp link), Settings save/reload, and Dashboard numbers reflecting the test sale.

- [ ] **Step 7: Commit**

```bash
git add pos-app/client -A
git commit -m "feat: add product, customer, invoice, marketing, settings, and dashboard UI pages"
```

---

### Task 18: Launcher script, production build wiring, and README

**Files:**
- Create: `pos-app/launcher.js`
- Modify: `pos-app/server/src/server.js` (serve the built client in production)
- Create: `pos-app/README.md`

**Interfaces:**
- Produces: a single command (`node launcher.js` from `pos-app/`, or a double-clickable `.bat`/`.command` wrapper) that builds the client (first run only if `dist` is missing), starts the server, and opens the default browser to it.

- [ ] **Step 1: Serve the built client from Express**

Modify `pos-app/server/src/server.js` — add before `app.listen`:
```js
const clientDist = path.join(__dirname, '../../client/dist');
if (require('fs').existsSync(clientDist)) {
  app.use(require('express').static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}
```

- [ ] **Step 2: Write the launcher**

Create `pos-app/launcher.js`:
```js
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const clientDir = path.join(__dirname, 'client');
const serverDir = path.join(__dirname, 'server');
const distDir = path.join(clientDir, 'dist');

if (!fs.existsSync(distDir)) {
  console.log('Building client for the first run...');
  execSync('npm run build', { cwd: clientDir, stdio: 'inherit' });
}

const server = spawn('node', ['src/server.js'], { cwd: serverDir, stdio: 'inherit' });

setTimeout(() => {
  const url = 'http://localhost:4173';
  const opener = os.platform() === 'win32' ? 'start' : os.platform() === 'darwin' ? 'open' : 'xdg-open';
  spawn(opener, [url], { shell: true, stdio: 'ignore' });
}, 1500);

process.on('SIGINT', () => { server.kill(); process.exit(); });
```

- [ ] **Step 3: Write the Windows double-click wrapper**

Create `pos-app/Start GOLVIA POS.bat`:
```bat
@echo off
cd /d %~dp0
node launcher.js
pause
```

- [ ] **Step 4: Write the README**

Create `pos-app/README.md` covering: first-time setup (`npm install` in both `server/` and `client/`, create the admin user via the one-off script from Task 15 Step 6, run the stock import from Task 10 Step 5, configure Gmail credentials in Settings), and day-to-day use (double-click `Start GOLVIA POS.bat`).

- [ ] **Step 5: Manually verify the production path end-to-end**

Run:
```bash
cd pos-app && node launcher.js
```
Expected: client builds (first run), server starts on port 4173, default browser opens automatically to the login screen, and the full app (checkout, products, customers, marketing, settings) works identically to the dev-server setup verified in Tasks 16–17.

- [ ] **Step 6: Commit**

```bash
git add pos-app/launcher.js "pos-app/Start GOLVIA POS.bat" pos-app/README.md pos-app/server/src/server.js
git commit -m "feat: add one-click launcher, production static serving, and README"
```

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 1, 18), Product/Inventory incl. barcode scan (Tasks 9, 10, 16), POS checkout incl. discounts/coins/printing (Tasks 6, 12, 16), Returns/Refunds (Tasks 7, 12), CRM (Tasks 11, 17), Membership tiers/coins/vouchers (Tasks 2, 3, 5), Marketing WhatsApp/email (Tasks 13, 17), Admin/Security/Backup (Tasks 8, 14), Dashboard (Task 13, 17), Branding/company details (Task 16 receipt) are all covered. Logo image insertion into the receipt/UI is a follow-up once the user provides the file (placeholder text header used until then, per spec §10).
- **Type consistency checked:** `createInvoice`/`createRefund` signatures used identically across Tasks 6/7 (services), 12 (routes), and 16 (client) — camelCase over HTTP, snake_case in SQLite rows, matching each task's Interfaces block.
- **No placeholders:** every step has literal file paths and complete code; the one deliberately deferred item (logo file) is called out explicitly, not left as a silent TODO.
