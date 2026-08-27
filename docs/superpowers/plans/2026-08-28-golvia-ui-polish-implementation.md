# GOLVIA POS UI Polish & Feature Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a consistent "Cream & Gold" branded visual design across every screen, add inline customer creation at checkout, redesign the printed receipt, display product images (captured from the stock spreadsheet), and fix the Marketing tab's confusing empty state.

**Architecture:** A single shared stylesheet (`theme.css`) defines the design system (CSS custom properties + global element styling + a handful of utility classes: `.golvia-page`, `.golvia-card`, `.golvia-nav`, `.golvia-badge`, `.golvia-thumb`, `.golvia-empty`, `.golvia-error`/`.golvia-success`, `.golvia-field`, `.golvia-btn-primary`). Because it styles bare HTML elements (`button`, `input`, `table`, `h2`, etc.) globally rather than requiring every element to carry a new class, most pages get 80% of the visual change "for free"; each page task then adds the handful of structural classes (page wrapper, card grouping, primary button) and any page-specific additions (image thumbnails, badges, empty states). Two small backend changes support this: image URLs are captured on stock import (and backfilled into the already-imported catalog), and the invoice-detail endpoint gains the customer's membership tier so the receipt can show it.

**Tech Stack:** React 18 (existing pages), plain CSS (no new dependency), Node.js/Express/better-sqlite3 (existing server, `node:test` for the two backend changes).

## Global Constraints

- Palette: background `#faf6ec`, nav bar `#1c1c1c`, gold accent `#c9a227` (dark variant `#a6791f`), border/divider `#e6ddc0`, body text `#2a2a2a` — exact values from the approved mockup, do not substitute.
- Typography: Georgia (or `'Times New Roman', serif` fallback) for headings/brand; `'Helvetica Neue', Arial, sans-serif` for body/data/forms.
- No layout restructuring — this is a styling + two small feature additions pass. Do not rearrange navigation, rename routes, or change any business logic, API contract, or money calculation.
- Product images load directly from the spreadsheet's original web link — no local download/hosting.
- No images on the printed/emailed receipt (user's explicit choice).
- Every client (`pos-app/client`) task's verification is `npm run build` (this project has no React component test setup — matches the existing project convention of build-clean + manual browser verification for UI work). Every server (`pos-app/server`) task's verification is `node --test` (or `npm test`), following existing TDD patterns in that codebase.

---

## File Structure

```
pos-app/
  client/src/
    theme.css                 (NEW — design system)
    index.css                 (MODIFY — strip conflicting Vite-starter rules)
    main.jsx                  (MODIFY — import theme.css)
    App.jsx                   (MODIFY — restyle nav)
    pages/
      Login.jsx                (MODIFY — restyle)
      Checkout.jsx              (MODIFY — restyle, inline new-customer form, product thumbnails)
      InvoiceReceipt.jsx        (MODIFY — redesign to approved mockup, print-width fix, tier badge)
      Products.jsx              (MODIFY — restyle, thumbnail column)
      ProductForm.jsx           (MODIFY — restyle, image URL field + preview)
      Customers.jsx              (MODIFY — restyle)
      CustomerProfile.jsx        (MODIFY — restyle)
      Dashboard.jsx               (MODIFY — restyle)
      Invoices.jsx                (MODIFY — restyle)
      Settings.jsx                (MODIFY — restyle)
      Marketing.jsx                (MODIFY — restyle, empty-state message)
  server/src/
    services/
      importStock.js            (MODIFY — capture main_image as image_url)
      backfillProductImages.js  (NEW — one-time backfill for the already-imported catalog)
    routes/
      invoices.js                (MODIFY — include customer.tier in invoice detail response)
  server/test/
    services/
      importStock.test.js          (MODIFY — add image_url capture test)
      backfillProductImages.test.js (NEW)
    routes/
      invoices.test.js              (MODIFY — add customer.tier assertion)
```

---

### Task 1: Design system stylesheet + shell restyle (App.jsx nav, Login.jsx)

**Files:**
- Create: `pos-app/client/src/theme.css`
- Modify: `pos-app/client/src/index.css`
- Modify: `pos-app/client/src/main.jsx`
- Modify: `pos-app/client/src/App.jsx`
- Modify: `pos-app/client/src/pages/Login.jsx`

**Interfaces:**
- Produces: CSS custom properties (`--golvia-bg`, `--golvia-nav-bg`, `--golvia-gold`, `--golvia-gold-dark`, `--golvia-gold-tint`, `--golvia-border`, `--golvia-text`, `--golvia-text-muted`, `--golvia-danger`, `--golvia-success`, `--golvia-font-heading`, `--golvia-font-body`) and utility classes (`.golvia-page`, `.golvia-card`, `.golvia-nav`, `.golvia-brand`, `.golvia-links`, `.golvia-user`, `.golvia-btn-primary`, `.golvia-badge`, `.golvia-empty`, `.golvia-error`, `.golvia-success`, `.golvia-field`, `.golvia-toolbar`, `.golvia-thumb`, `.golvia-thumb-lg`) that every later task in this plan uses by name.

- [ ] **Step 1: Create the theme stylesheet**

Create `pos-app/client/src/theme.css`:
```css
:root {
  --golvia-bg: #faf6ec;
  --golvia-surface: #fffdf8;
  --golvia-nav-bg: #1c1c1c;
  --golvia-nav-text: #e8d9a8;
  --golvia-gold: #c9a227;
  --golvia-gold-dark: #a6791f;
  --golvia-gold-tint: #fbf3dc;
  --golvia-border: #e6ddc0;
  --golvia-text: #2a2a2a;
  --golvia-text-muted: #767066;
  --golvia-danger: #b3261e;
  --golvia-success: #2e7d32;
  --golvia-font-heading: Georgia, 'Times New Roman', serif;
  --golvia-font-body: 'Helvetica Neue', Arial, sans-serif;
}

body {
  background: var(--golvia-bg);
  color: var(--golvia-text);
  font-family: var(--golvia-font-body);
  margin: 0;
}

a { color: var(--golvia-gold-dark); }

h1, h2, h3 {
  font-family: var(--golvia-font-heading);
  color: var(--golvia-text);
  margin: 0 0 12px;
}
h2 { font-size: 22px; letter-spacing: 0.5px; }
h3 { font-size: 16px; color: var(--golvia-gold-dark); margin-top: 24px; }

.golvia-page { max-width: 1000px; margin: 0 auto; padding: 28px 24px; box-sizing: border-box; }

.golvia-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  background: var(--golvia-nav-bg);
  padding: 14px 24px;
  border-bottom: 2px solid var(--golvia-gold);
}
.golvia-brand {
  font-family: var(--golvia-font-heading);
  color: var(--golvia-gold);
  font-size: 20px;
  letter-spacing: 2px;
  text-decoration: none;
}
.golvia-links { display: flex; gap: 16px; flex-wrap: wrap; }
.golvia-links a {
  color: var(--golvia-nav-text);
  text-decoration: none;
  font-size: 13px;
  letter-spacing: 0.5px;
}
.golvia-links a:hover { color: var(--golvia-gold); }
.golvia-user { display: flex; align-items: center; gap: 10px; color: var(--golvia-nav-text); font-size: 13px; }

.golvia-card {
  background: var(--golvia-surface);
  border: 1px solid var(--golvia-border);
  border-radius: 8px;
  padding: 18px 20px;
  margin-bottom: 20px;
}

button {
  font-family: var(--golvia-font-body);
  font-size: 13px;
  padding: 9px 18px;
  border-radius: 5px;
  border: 1px solid var(--golvia-border);
  background: var(--golvia-surface);
  color: var(--golvia-text);
  cursor: pointer;
  letter-spacing: 0.3px;
}
button:hover { border-color: var(--golvia-gold); }
button:disabled { opacity: 0.5; cursor: not-allowed; }

.golvia-btn-primary {
  background: var(--golvia-gold) !important;
  border-color: var(--golvia-gold-dark) !important;
  color: #1c1500 !important;
  font-weight: 600;
}
.golvia-btn-primary:hover { background: var(--golvia-gold-dark) !important; }

input, select, textarea {
  font-family: var(--golvia-font-body);
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 5px;
  border: 1px solid var(--golvia-border);
  background: #fff;
  color: var(--golvia-text);
  box-sizing: border-box;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--golvia-gold);
  box-shadow: 0 0 0 2px var(--golvia-gold-tint);
}

table { border-collapse: collapse; width: 100%; margin: 10px 0; }
th {
  text-align: left;
  font-family: var(--golvia-font-body);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--golvia-gold-dark);
  border-bottom: 2px solid var(--golvia-gold);
  padding: 8px 10px;
}
td { padding: 8px 10px; border-bottom: 1px solid var(--golvia-border); font-size: 13px; }

.golvia-badge {
  display: inline-block;
  background: var(--golvia-nav-bg);
  color: var(--golvia-nav-text);
  font-size: 10px;
  letter-spacing: 0.5px;
  padding: 3px 9px;
  border-radius: 10px;
  font-family: var(--golvia-font-body);
}

.golvia-empty { color: var(--golvia-text-muted); font-style: italic; padding: 20px 0; }
.golvia-error { color: var(--golvia-danger); font-size: 13px; }
.golvia-success { color: var(--golvia-success); font-size: 13px; }

.golvia-thumb {
  width: 42px; height: 42px;
  object-fit: cover;
  border-radius: 5px;
  border: 1px solid var(--golvia-border);
  background: #f0ece0;
  vertical-align: middle;
  display: inline-block;
}
.golvia-thumb-lg {
  width: 160px; height: 160px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--golvia-border);
  background: #f0ece0;
  display: block;
}

.golvia-field { margin-bottom: 10px; }
.golvia-field label { display: block; font-size: 12px; color: var(--golvia-text-muted); margin-bottom: 4px; }

.golvia-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
```

- [ ] **Step 2: Strip the conflicting Vite-starter rules from `index.css`**

Modify `pos-app/client/src/index.css` — the file currently sets a purple `--accent` theme, a fixed `1126px` centered `#root` with `border-inline` and `text-align: center`, and dark-mode overrides that all conflict with `theme.css`. Replace the entire file with:
```css
* { box-sizing: border-box; }

body { margin: 0; }

#root { min-height: 100svh; display: flex; flex-direction: column; }

code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  padding: 2px 5px;
  border-radius: 3px;
  background: #f0ece0;
}
```

- [ ] **Step 3: Import the theme stylesheet**

Modify `pos-app/client/src/main.jsx`:
```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: Restyle the nav in `App.jsx`**

Modify `pos-app/client/src/App.jsx` — replace the `<nav>` block (and nothing else in the file):
```jsx
        <nav className="golvia-nav">
          <span className="golvia-brand">GOLVIA</span>
          <div className="golvia-links">
            <Link to="/">Checkout</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/products">Products</Link>
            <Link to="/customers">Customers</Link>
            <Link to="/invoices">Sales</Link>
            <Link to="/marketing">Marketing</Link>
            <Link to="/settings">Settings</Link>
          </div>
          <div className="golvia-user">
            <span>{user.username}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        </nav>
```

- [ ] **Step 5: Restyle `Login.jsx`**

Replace `pos-app/client/src/pages/Login.jsx` in full:
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
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
      <form onSubmit={handleSubmit} className="golvia-card" style={{ width: 320 }}>
        <h1 style={{ textAlign: 'center', color: 'var(--golvia-gold-dark)', letterSpacing: 2 }}>GOLVIA POS</h1>
        <div className="golvia-field">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="golvia-field">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%' }} />
        </div>
        {error && <p className="golvia-error">{error}</p>}
        <button type="submit" className="golvia-btn-primary" style={{ width: '100%' }}>Log in</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Verify the build**

Run: `cd pos-app/client && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 7: Commit**

```bash
git add pos-app/client/src/theme.css pos-app/client/src/index.css pos-app/client/src/main.jsx pos-app/client/src/App.jsx pos-app/client/src/pages/Login.jsx
git commit -m "feat: add GOLVIA cream & gold design system, restyle nav and login"
```

---

### Task 2: Capture product images on import and backfill the existing catalog

**Files:**
- Modify: `pos-app/server/src/services/importStock.js`
- Create: `pos-app/server/src/services/backfillProductImages.js`
- Modify: `pos-app/server/test/services/importStock.test.js`
- Create: `pos-app/server/test/services/backfillProductImages.test.js`

**Interfaces:**
- Modifies: `parseStockRows(rows)` — each returned group now also has an `image_url` field (captured from the first row's `main_image` column, matching how `category`/`brand`/`description` are already captured from the first row per product name).
- Modifies: `importIntoDb(db, groupedProducts)` — now also persists `image_url` on the `products` row.
- Produces: `backfillImageUrls(db, groupedProducts) -> { updated: number }` — for each group with a non-empty `image_url`, updates any existing `products` row with a matching `name` and a currently-empty `image_url`. Never overwrites an image that's already set (safe to re-run, and won't clobber an image entered manually through the product-edit UI).

- [ ] **Step 1: Write the failing tests for image capture**

Modify `pos-app/server/test/services/importStock.test.js` — add these two tests at the end of the file:
```js
test('parseStockRows captures main_image as image_url from the first row', () => {
  const rows = [
    { product_name: 'Cincin Eksklusif Adjustable', category: 'Rings (605273)', brand: 'GOLVIA', variation_value: 'ROSELLE', Cost: 4, price: 40, quantity: 48, seller_sku: 'CINCIN-aurora 0040', main_image: 'https://example.com/ring.jpg' },
    { product_name: 'Cincin Eksklusif Adjustable', category: 'Rings (605273)', brand: 'GOLVIA', variation_value: 'AURORA', Cost: 4.5, price: 45, quantity: 73, seller_sku: 'CINCIN-aurora 0045', main_image: 'https://example.com/ring-2.jpg' },
  ];
  const grouped = parseStockRows(rows);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].image_url, 'https://example.com/ring.jpg');
});

test('importIntoDb stores image_url on the product row', () => {
  const tmp = path.join(__dirname, `tmp-import-img-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  const grouped = [{ name: 'Test Ring', category: 'Rings', brand: 'GOLVIA', description: '', image_url: 'https://example.com/ring.jpg', variants: [
    { variant_label: '40g', sku: 'T-40', cost_price: 4, sell_price: 40, quantity: 10 },
  ] }];
  importIntoDb(db, grouped);
  const product = db.prepare('SELECT * FROM products').get();
  assert.equal(product.image_url, 'https://example.com/ring.jpg');
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd pos-app/server && node --test test/services/importStock.test.js`
Expected: FAIL — `grouped[0].image_url` is `undefined`, `product.image_url` is `null`.

- [ ] **Step 3: Implement image capture in `importStock.js`**

Modify `pos-app/server/src/services/importStock.js`:
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
        image_url: row.main_image || '',
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
    INSERT INTO products (name, category, description, brand, image_url) VALUES (?, ?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO product_variants (product_id, variant_label, sku, cost_price, sell_price, quantity) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const p of groupedProducts) {
      const result = insertProduct.run(p.name, p.category, p.description, p.brand, p.image_url || null);
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pos-app/server && node --test test/services/importStock.test.js`
Expected: PASS (4 tests: the 2 pre-existing + the 2 new).

- [ ] **Step 5: Write the failing test for the backfill script**

Create `pos-app/server/test/services/backfillProductImages.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../../src/db/db');
const { backfillImageUrls } = require('../../src/services/backfillProductImages');

test('backfillImageUrls fills image_url only for products missing one', () => {
  const tmp = path.join(__dirname, `tmp-backfill-${Date.now()}.sqlite`);
  const db = initDb(tmp);
  db.prepare(`INSERT INTO products (id, name, image_url) VALUES (1, 'Ring A', NULL)`).run();
  db.prepare(`INSERT INTO products (id, name, image_url) VALUES (2, 'Ring B', 'https://existing.com/b.jpg')`).run();

  const grouped = [
    { name: 'Ring A', image_url: 'https://example.com/a.jpg', variants: [] },
    { name: 'Ring B', image_url: 'https://example.com/b-new.jpg', variants: [] },
  ];
  const result = backfillImageUrls(db, grouped);

  assert.equal(result.updated, 1);
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id = 1').get().image_url, 'https://example.com/a.jpg');
  assert.equal(db.prepare('SELECT image_url FROM products WHERE id = 2').get().image_url, 'https://existing.com/b.jpg');
  db.close(); fs.unlinkSync(tmp);
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/services/backfillProductImages.test.js`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the backfill script**

Create `pos-app/server/src/services/backfillProductImages.js`:
```js
const { parseStockRows } = require('./importStock');

function backfillImageUrls(db, groupedProducts) {
  let updated = 0;
  const updateStmt = db.prepare(`
    UPDATE products SET image_url = ? WHERE name = ? AND (image_url IS NULL OR image_url = '')
  `);
  for (const p of groupedProducts) {
    if (!p.image_url) continue;
    const result = updateStmt.run(p.image_url, p.name);
    updated += result.changes;
  }
  return { updated };
}

// CLI entry point: node src/services/backfillProductImages.js <path-to-xlsx>
if (require.main === module) {
  const xlsx = require('xlsx');
  const { getDb } = require('../db/db');
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node backfillProductImages.js <path-to-xlsx>');
    process.exit(1);
  }
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);
  const grouped = parseStockRows(rows);
  const db = getDb();
  const result = backfillImageUrls(db, grouped);
  console.log(`Backfilled image_url on ${result.updated} product(s).`);
}

module.exports = { backfillImageUrls };
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/services/backfillProductImages.test.js`
Expected: PASS (1 test).

- [ ] **Step 9: Run the real backfill against the user's actual database**

Run:
```bash
cd pos-app/server && node src/services/backfillProductImages.js "D:/Admin/Documents/GOLVIA/Golvia Stocks List.xlsx"
```
Expected: prints `Backfilled image_url on N product(s).` with N > 0 (the current database was imported before this feature existed, so its products are all missing images).

- [ ] **Step 10: Run the full server test suite**

Run: `cd pos-app/server && node --test`
Expected: all tests pass, no regressions.

- [ ] **Step 11: Commit**

```bash
git add pos-app/server/src/services/importStock.js pos-app/server/src/services/backfillProductImages.js pos-app/server/test/services/importStock.test.js pos-app/server/test/services/backfillProductImages.test.js
git commit -m "feat: capture product images on import and backfill the existing catalog"
```

---

### Task 3: Checkout screen — restyle, inline new-customer creation, product thumbnails

**Files:**
- Modify: `pos-app/client/src/pages/Checkout.jsx`

**Interfaces:**
- Consumes: `.golvia-page`, `.golvia-card`, `.golvia-btn-primary`, `.golvia-field`, `.golvia-error`, `.golvia-thumb`, `.golvia-toolbar` (Task 1); `POST /api/customers` (existing endpoint, unchanged — accepts `{name, phone, email, whatsapp_consent}`, returns `201` with the created customer + membership, or `409 {error: 'PHONE_EXISTS'}`); `products.image_url` field (Task 2, already present on every `GET /api/products` response regardless of whether it's populated).

- [ ] **Step 1: Replace `Checkout.jsx` in full**

```jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

function refocusScanUnlessMovingToField(e, scanRef) {
  const next = e.relatedTarget;
  const isFormControl = next && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(next.tagName);
  if (!isFormControl) {
    scanRef.current?.focus();
  }
}

export default function Checkout() {
  const [search, setSearch] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]); // {variantId, name, variantLabel, unitPrice, quantity, itemDiscount}
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '', email: '', whatsapp_consent: false });
  const [lumpSumType, setLumpSumType] = useState('amount');
  const [lumpSumValue, setLumpSumValue] = useState(0);
  const [coinsToRedeem, setCoinsToRedeem] = useState(0);
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
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
      setSelectedVoucherId('');
      setShowNewCustomerForm(false);
    } catch {
      setCustomer(null);
      setSelectedVoucherId('');
      setError('Customer not found — use "+ New customer" below to add them, or check out as guest.');
    }
  }

  async function createCustomerInline() {
    setError('');
    try {
      const c = await apiClient.post('/customers', newCustomerForm);
      setCustomer({ ...c, vouchers: [] }); // a brand-new customer has no vouchers yet
      setPhone(c.phone);
      setSelectedVoucherId('');
      setShowNewCustomerForm(false);
      setNewCustomerForm({ name: '', phone: '', email: '', whatsapp_consent: false });
    } catch (err) {
      setError(err.data?.error === 'PHONE_EXISTS'
        ? 'A customer with this phone number already exists — try "Look up" instead.'
        : 'Could not create customer.');
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
        voucherId: selectedVoucherId ? Number(selectedVoucherId) : null,
      });
      navigate(`/invoices/${invoice.id}/receipt`);
    } catch (err) {
      setError(err.data?.error === 'INSUFFICIENT_STOCK' ? 'Not enough stock for one or more items.' :
                err.data?.error === 'INSUFFICIENT_COINS' ? 'Customer does not have enough coins.' :
                err.data?.error === 'VOUCHER_NO_VALUE' ? 'This voucher has no value left to apply — the cart total is already RM0 from other discounts or coin redemption. Reduce a discount or the coins redeemed to use this voucher.' :
                err.data?.error === 'INVALID_VOUCHER' ? 'The selected voucher is not valid for this sale.' :
                err.data?.error === 'INVALID_ITEM_QUANTITY' ? 'Check the item quantities, discounts, and coins entered — one of them is not a valid positive number.' :
                'Checkout failed.');
    }
  }

  return (
    <div className="golvia-page">
      <h2>Checkout</h2>

      <div className="golvia-card">
        <div className="golvia-toolbar">
          <input ref={scanRef} placeholder="Scan barcode / SKU here" value={scanInput}
            onChange={e => setScanInput(e.target.value)} onKeyDown={handleScan}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
          <input placeholder="Search products" value={search} onChange={e => runSearch(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
        </div>
        {results.length > 0 && (
          <table>
            <tbody>
              {results.map(p => (
                <tr key={p.id}>
                  <td style={{ width: 50 }}>
                    {p.image_url ? <img className="golvia-thumb" src={p.image_url} alt="" /> : <span className="golvia-thumb" />}
                  </td>
                  <td>{p.name}</td>
                  <td>
                    {p.variants.map(v => (
                      <button key={v.id} onClick={() => addVariantToCart(p, v)} style={{ marginRight: 6 }}>
                        {v.variant_label} — RM{v.sell_price} (add)
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Cart</h3>
        <table>
          <tbody>
            {cart.map(i => (
              <tr key={i.variantId}>
                <td>{i.name} ({i.variantLabel})</td>
                <td>x{i.quantity}</td>
                <td>RM{i.unitPrice}</td>
                <td>
                  Discount RM <input type="number" min="0" value={i.itemDiscount}
                    onChange={e => updateItemDiscount(i.variantId, e.target.value)}
                    onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: 60 }} />
                </td>
                <td><button onClick={() => removeItem(i.variantId)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Customer</h3>
        <div className="golvia-toolbar">
          <input placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
          <button onClick={lookupCustomer}>Look up</button>
          {!customer && <button onClick={() => setShowNewCustomerForm(s => !s)}>{showNewCustomerForm ? 'Cancel' : '+ New customer'}</button>}
        </div>

        {customer && (
          <p>{customer.name} — <span className="golvia-badge">{customer.membership.tier}</span> {customer.membership.current_coin_balance} coins</p>
        )}

        {!customer && showNewCustomerForm && (
          <div style={{ borderTop: '1px solid var(--golvia-border)', paddingTop: 12, marginTop: 8 }}>
            <div className="golvia-field">
              <label>Name</label>
              <input value={newCustomerForm.name} onChange={e => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: '100%' }} />
            </div>
            <div className="golvia-field">
              <label>Phone</label>
              <input value={newCustomerForm.phone} onChange={e => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: '100%' }} />
            </div>
            <div className="golvia-field">
              <label>Email (optional)</label>
              <input value={newCustomerForm.email} onChange={e => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} style={{ width: '100%' }} />
            </div>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <input type="checkbox" checked={newCustomerForm.whatsapp_consent}
                onChange={e => setNewCustomerForm({ ...newCustomerForm, whatsapp_consent: e.target.checked })} /> WhatsApp consent
            </label>
            <button className="golvia-btn-primary" onClick={createCustomerInline}>Create &amp; use for this sale</button>
          </div>
        )}

        {customer && customer.vouchers && customer.vouchers.length > 0 && (
          <div className="golvia-field">
            <label>Voucher</label>
            <select value={selectedVoucherId} onChange={e => setSelectedVoucherId(e.target.value)}
              onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
              <option value="">None</option>
              {customer.vouchers.map(v => (
                <option key={v.id} value={v.id}>
                  RM{v.value} off (min spend RM{v.min_spend})
                </option>
              ))}
            </select>
          </div>
        )}

        {customer && (
          <div className="golvia-field">
            <label>Redeem coins</label>
            <input type="number" min="0" step="1" value={coinsToRedeem} onChange={e => setCoinsToRedeem(e.target.value)}
              onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} />
          </div>
        )}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Discounts &amp; Payment</h3>
        <div className="golvia-toolbar">
          <select value={lumpSumType} onChange={e => setLumpSumType(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
            <option value="amount">RM amount</option>
            <option value="percent">%</option>
          </select>
          <input type="number" value={lumpSumValue} onChange={e => setLumpSumValue(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)} placeholder="Lump-sum discount" />
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
            onBlur={(e) => refocusScanUnlessMovingToField(e, scanRef)}>
            <option>Cash</option>
            <option>DuitNow/QR</option>
            <option>Bank Transfer</option>
            <option>E-wallet</option>
          </select>
        </div>

        <p style={{ fontSize: 18, fontWeight: 'bold' }}>Subtotal: RM{subtotal.toFixed(2)}</p>
        {error && <p className="golvia-error">{error}</p>}
        <button className="golvia-btn-primary" onClick={handleCheckout} disabled={cart.length === 0}>Complete Sale</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd pos-app/client && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add pos-app/client/src/pages/Checkout.jsx
git commit -m "feat: restyle checkout, add inline new-customer creation and product thumbnails"
```

---

### Task 4: Receipt redesign, print-width fix, tier badge

**Files:**
- Modify: `pos-app/server/src/routes/invoices.js`
- Modify: `pos-app/server/test/routes/invoices.test.js`
- Modify: `pos-app/client/src/pages/InvoiceReceipt.jsx`

**Interfaces:**
- Modifies: `getInvoiceWithDetails(db, invoiceId)` — the returned `customer` object (when present) now also has a `tier` field (`'White'|'Silver'|'Gold'|'Platinum'`), read from `membership_accounts`. `invoice.customer` is `null` for guest sales, unchanged.

- [ ] **Step 1: Write the failing test for the tier field**

Modify `pos-app/server/test/routes/invoices.test.js` — add this test (check the top of the file for its existing `setup()`/auth-agent helper pattern and match it):
```js
test('GET /invoices/:id includes the customer\'s membership tier', async () => {
  const { agent, db, tmp } = await setup();
  db.prepare(`INSERT INTO customers (id, name, phone) VALUES (1, 'Alice', '0123456789')`).run();
  db.prepare(`INSERT INTO membership_accounts (customer_id, lifetime_coins, current_coin_balance, tier) VALUES (1, 4000, 4000, 'Silver')`).run();

  const checkout = await agent.post('/api/invoices').send({
    customerId: 1,
    items: [{ variantId: 1, quantity: 1, unitPrice: 300, itemDiscount: 0 }],
    lumpSumDiscount: null, coinsToRedeem: 0, paymentMethod: 'Cash',
  });

  const detail = await agent.get(`/api/invoices/${checkout.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.customer.tier, 'Silver');

  db.close(); fs.unlinkSync(tmp);
});
```
(If the file's existing `setup()` doesn't already seed a variant with id 1 usable for checkout, reuse whatever pattern the file's other checkout-based tests already use for that — match the existing style exactly rather than inventing a new one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pos-app/server && node --test test/routes/invoices.test.js`
Expected: FAIL — `detail.body.customer.tier` is `undefined`.

- [ ] **Step 3: Add the tier field to `getInvoiceWithDetails`**

Modify `pos-app/server/src/routes/invoices.js` — change the `getInvoiceWithDetails` function's customer-fetching line:
```js
  const customer = invoice.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(invoice.customer_id) : null;
  const membership = customer ? db.prepare('SELECT tier FROM membership_accounts WHERE customer_id = ?').get(customer.id) : null;
  return { ...invoice, items, customer: customer ? { ...customer, tier: membership ? membership.tier : null } : null };
```
(replacing the previous `const customer = ...` line and `return { ...invoice, items, customer };` line — everything else in the function is unchanged).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pos-app/server && node --test test/routes/invoices.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full server test suite**

Run: `cd pos-app/server && node --test`
Expected: all tests pass, no regressions (the email-receipt HTML builder and every other consumer of `getInvoiceWithDetails` only reads fields that still exist unchanged).

- [ ] **Step 6: Redesign `InvoiceReceipt.jsx`**

Replace `pos-app/client/src/pages/InvoiceReceipt.jsx` in full:
```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

const REFUND_ERROR_MESSAGES = {
  INVOICE_ITEM_NOT_FOUND: 'One of the selected items could not be found on this invoice.',
  INVALID_REFUND_LINES: 'Enter a valid return quantity for at least one item.',
  REFUND_QUANTITY_EXCEEDS_REMAINING: 'The return quantity exceeds what is still refundable for one or more items.',
};

const EMAIL_RECEIPT_ERROR_MESSAGES = {
  NO_CUSTOMER_EMAIL: 'This customer has no email on file.',
  EMAIL_SEND_FAILED: 'Failed to send the receipt email. Please try again.',
};

export default function InvoiceReceipt() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [returnQuantities, setReturnQuantities] = useState({});
  const [refundPaymentMethod, setRefundPaymentMethod] = useState('Cash');
  const [refundError, setRefundError] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // { type: 'success' | 'error', text }
  const [sendingEmail, setSendingEmail] = useState(false);

  function loadInvoice() {
    return apiClient.get(`/invoices/${id}`).then(inv => {
      setInvoice(inv);
      setReturnQuantities({});
    });
  }

  useEffect(() => { loadInvoice(); }, [id]);

  if (!invoice) return <p className="golvia-page">Loading...</p>;

  function updateReturnQuantity(itemId, value, max) {
    let qty = Number(value);
    if (Number.isNaN(qty) || qty < 0) qty = 0;
    if (qty > max) qty = max;
    setReturnQuantities(prev => ({ ...prev, [itemId]: qty }));
  }

  async function emailReceipt() {
    setEmailStatus(null);
    setSendingEmail(true);
    try {
      await apiClient.post(`/invoices/${id}/email-receipt`);
      setEmailStatus({ type: 'success', text: 'Receipt emailed to customer.' });
    } catch (err) {
      setEmailStatus({
        type: 'error',
        text: EMAIL_RECEIPT_ERROR_MESSAGES[err.data?.error] || err.data?.error || 'Failed to email receipt.',
      });
    } finally {
      setSendingEmail(false);
    }
  }

  async function processReturn() {
    setRefundError('');
    const lines = invoice.items
      .map(i => ({ invoiceItemId: i.id, quantity: Number(returnQuantities[i.id]) || 0 }))
      .filter(l => l.quantity > 0);
    if (lines.length === 0) {
      setRefundError('Enter a return quantity greater than 0 for at least one item.');
      return;
    }
    setProcessingRefund(true);
    try {
      await apiClient.post(`/invoices/${id}/refund`, { lines, paymentMethod: refundPaymentMethod });
      await loadInvoice();
    } catch (err) {
      setRefundError(REFUND_ERROR_MESSAGES[err.data?.error] || err.data?.error || 'Refund failed.');
    } finally {
      setProcessingRefund(false);
    }
  }

  return (
    <div className="golvia-page">
      <style>{`
        @media print {
          @page { size: A5; margin: 10mm; }
          body * { visibility: hidden; }
          .receipt-printable, .receipt-printable * { visibility: visible; }
          .receipt-printable {
            position: absolute; left: 0; top: 0;
            width: 100%; max-width: 128mm; min-height: 0;
            box-sizing: border-box; padding: 0 !important; border: none !important; box-shadow: none !important;
          }
        }
      `}</style>

      <div className="receipt-printable golvia-card" style={{ maxWidth: 380, margin: '0 auto', fontFamily: 'var(--golvia-font-heading)' }}>
        <div style={{ textAlign: 'center', letterSpacing: 3, fontSize: 22, color: 'var(--golvia-gold-dark)', fontWeight: 'bold' }}>GOLVIA</div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--golvia-text-muted)', fontFamily: 'var(--golvia-font-body)', marginTop: 4, lineHeight: 1.5 }}>
          16 Jalan SC 1, Pusat Perindustrian Sungai Chua<br />43200 Kajang, Selangor, Malaysia
        </div>
        <hr style={{ border: 'none', borderTop: '2px solid var(--golvia-gold)', margin: '12px 0' }} />

        <div style={{ fontSize: 12, fontFamily: 'var(--golvia-font-body)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Invoice</span><span>{invoice.invoice_number}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date</span><span>{new Date(invoice.created_at).toLocaleString()}</span></div>
          {invoice.customer && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Customer</span>
              <span>{invoice.customer.name} {invoice.customer.tier && <span className="golvia-badge">{invoice.customer.tier}</span>}</span>
            </div>
          )}
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid var(--golvia-border)', margin: '10px 0' }} />

        <table style={{ fontFamily: 'var(--golvia-font-body)' }}>
          <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
          <tbody>
            {invoice.items.map(i => (
              <tr key={i.id}>
                <td>{i.product_name} ({i.variant_label})</td>
                <td>{i.quantity}</td>
                <td>RM{i.unit_price}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontFamily: 'var(--golvia-font-body)', fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Subtotal</span><span>RM{invoice.subtotal.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>Discount</span><span>−RM{invoice.discount_total.toFixed(2)}</span></div>
          {invoice.coins_redeemed > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>Coins redeemed</span><span>−RM{(invoice.coins_redeemed / 100).toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16, borderTop: '1px solid var(--golvia-text)', marginTop: 6, paddingTop: 6 }}>
            <span>Total ({invoice.payment_method})</span><span>RM{invoice.total.toFixed(2)}</span>
          </div>
        </div>

        {invoice.customer && (
          <div style={{ background: 'var(--golvia-gold-tint)', border: '1px solid var(--golvia-border)', borderRadius: 4, padding: '8px 10px', marginTop: 12, fontSize: 11, fontFamily: 'var(--golvia-font-body)', color: 'var(--golvia-gold-dark)' }}>
            + {invoice.coins_earned} coins earned this visit
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--golvia-text-muted)', fontFamily: 'var(--golvia-font-body)', marginTop: 16 }}>
          Thank you for shopping with GOLVIA
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {invoice.customer && invoice.customer.email && (
        <div className="golvia-card" style={{ maxWidth: 380, margin: '20px auto 0' }}>
          <button onClick={emailReceipt} disabled={sendingEmail}>
            {sendingEmail ? 'Sending…' : 'Email receipt to customer'}
          </button>
          {emailStatus && (
            <p className={emailStatus.type === 'error' ? 'golvia-error' : 'golvia-success'}>{emailStatus.text}</p>
          )}
        </div>
      )}

      {invoice.status !== 'refunded' && (
        <div className="golvia-card" style={{ maxWidth: 380, margin: '20px auto 0' }}>
          <h3 style={{ marginTop: 0 }}>Process Return</h3>
          <table>
            <thead><tr><th>Item</th><th>Original Qty</th><th>Return Qty</th></tr></thead>
            <tbody>
              {invoice.items.map(i => (
                <tr key={i.id}>
                  <td>{i.product_name} ({i.variant_label})</td>
                  <td>{i.quantity}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={i.quantity}
                      value={returnQuantities[i.id] ?? 0}
                      onChange={e => updateReturnQuantity(i.id, e.target.value, i.quantity)}
                      style={{ width: 60 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="golvia-field">
            <label>Refund payment method</label>
            <select value={refundPaymentMethod} onChange={e => setRefundPaymentMethod(e.target.value)}>
              <option>Cash</option>
              <option>DuitNow/QR</option>
              <option>Bank Transfer</option>
              <option>E-wallet</option>
            </select>
          </div>

          {refundError && <p className="golvia-error">{refundError}</p>}
          <button onClick={processReturn} disabled={processingRefund}>Process Return</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify the build**

Run: `cd pos-app/client && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 8: Commit**

```bash
git add pos-app/server/src/routes/invoices.js pos-app/server/test/routes/invoices.test.js pos-app/client/src/pages/InvoiceReceipt.jsx
git commit -m "feat: redesign receipt to match approved mockup, add tier badge, fix A5 print width"
```

---

### Task 5: Products list + product edit — restyle, image thumbnail/preview/field

**Files:**
- Modify: `pos-app/client/src/pages/Products.jsx`
- Modify: `pos-app/client/src/pages/ProductForm.jsx`

**Interfaces:**
- Consumes: `products.image_url` (Task 2); `PUT /api/products/:id` and `POST /api/products` already accept and store `image_url` in the request body (no server change needed — confirmed existing behavior).

- [ ] **Step 1: Replace `Products.jsx` in full**

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
    <div className="golvia-page">
      <h2>Products</h2>
      <div className="golvia-toolbar">
        <input placeholder="Search" value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} />
        <Link to="/products/new"><button className="golvia-btn-primary">+ Add product</button></Link>
      </div>
      <table>
        <thead><tr><th></th><th>Name</th><th>Category</th><th>Variants</th></tr></thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id}>
              <td style={{ width: 50 }}>
                {p.image_url ? <img className="golvia-thumb" src={p.image_url} alt="" /> : <span className="golvia-thumb" />}
              </td>
              <td><Link to={`/products/${p.id}`}>{p.name}</Link></td>
              <td>{p.category}</td>
              <td>{p.variants.map(v => `${v.variant_label} (${v.quantity})`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {products.length === 0 && <p className="golvia-empty">No products found.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Replace `ProductForm.jsx` in full**

```jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function ProductForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', category: '', brand: '', description: '', image_url: '' });
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
      await apiClient.put(`/products/${id}`, {
        ...form,
        variants: variants.map(v => ({ id: v.id, cost_price: v.cost_price, sell_price: v.sell_price })),
      });
    }
    navigate('/products');
  }

  async function adjustStock(variantId) {
    const delta = Number(prompt('Quantity change (e.g. 5 or -2):'));
    const reason = prompt('Reason:');
    if (!reason || !reason.trim()) return alert('Reason is required.');
    try {
      await apiClient.post(`/products/${id}/variants/${variantId}/adjust-stock`, { delta, reason });
      apiClient.get(`/products/${id}`).then(p => setVariants(p.variants));
    } catch (err) {
      alert(err.data?.error === 'REASON_REQUIRED' ? 'A reason is required for stock adjustments.' : (err.data?.error || err.message || 'Stock adjustment failed.'));
    }
  }

  return (
    <div className="golvia-page">
      <h2>{isNew ? 'New Product' : 'Edit Product'}</h2>

      <div className="golvia-card" style={{ display: 'flex', gap: 20 }}>
        <div>
          {form.image_url
            ? <img className="golvia-thumb-lg" src={form.image_url} alt="" />
            : <div className="golvia-thumb-lg" />}
        </div>
        <div style={{ flex: 1 }}>
          <div className="golvia-field"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Category</label><input value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Brand</label><input value={form.brand || ''} onChange={e => setForm({ ...form, brand: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Image URL</label><input value={form.image_url || ''} onChange={e => setForm({ ...form, image_url: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Description</label><textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} style={{ width: '100%' }} /></div>
        </div>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Variants</h3>
        {variants.map((v, idx) => (
          <div key={idx} className="golvia-toolbar">
            <input placeholder="Label" value={v.variant_label} onChange={e => updateVariant(idx, 'variant_label', e.target.value)} />
            <input placeholder="SKU" value={v.sku} onChange={e => updateVariant(idx, 'sku', e.target.value)} />
            <input placeholder="Cost" type="number" value={v.cost_price} onChange={e => updateVariant(idx, 'cost_price', Number(e.target.value))} />
            <input placeholder="Price" type="number" value={v.sell_price} onChange={e => updateVariant(idx, 'sell_price', Number(e.target.value))} />
            <input placeholder="Qty" type="number" value={v.quantity} readOnly={!isNew}
              title={!isNew ? 'Use Adjust stock to change quantity' : undefined}
              onChange={e => isNew && updateVariant(idx, 'quantity', Number(e.target.value))} />
            {!isNew && <span style={{ fontSize: 11, color: 'var(--golvia-text-muted)' }}>use Adjust stock to change quantity</span>}
            {!isNew && v.id && <button onClick={() => adjustStock(v.id)}>Adjust stock</button>}
          </div>
        ))}
        {isNew && <button onClick={() => setVariants([...variants, { variant_label: '', sku: '', cost_price: 0, sell_price: 0, quantity: 0 }])}>+ Variant</button>}
      </div>

      <button className="golvia-btn-primary" onClick={save}>Save</button>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `cd pos-app/client && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 4: Commit**

```bash
git add pos-app/client/src/pages/Products.jsx pos-app/client/src/pages/ProductForm.jsx
git commit -m "feat: restyle product catalog, add image thumbnail/preview/edit field"
```

---

### Task 6: Customers list + customer profile — restyle

**Files:**
- Modify: `pos-app/client/src/pages/Customers.jsx`
- Modify: `pos-app/client/src/pages/CustomerProfile.jsx`

**Interfaces:**
- No behavior change — pure restyle, all existing fields/handlers unchanged.

- [ ] **Step 1: Replace `Customers.jsx` in full**

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', email: '', whatsapp_consent: false,
    birthday: '', state: '', gender: '', notes: '',
  });

  async function load(q = '') {
    setCustomers(await apiClient.get(`/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`));
  }
  useEffect(() => { load(); }, []);

  async function createCustomer() {
    await apiClient.post('/customers', form);
    setForm({ name: '', phone: '', email: '', whatsapp_consent: false, birthday: '', state: '', gender: '', notes: '' });
    load();
  }

  return (
    <div className="golvia-page">
      <h2>Customers</h2>

      <div className="golvia-card">
        <input placeholder="Search" value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }} style={{ width: '100%', marginBottom: 12 }} />
        {customers.map(c => (
          <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--golvia-border)' }}>
            <Link to={`/customers/${c.id}`}>{c.name}</Link> — {c.phone} <span className="golvia-badge">{c.membership.tier}</span>
          </div>
        ))}
        {customers.length === 0 && <p className="golvia-empty">No customers found.</p>}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Add customer</h3>
        <div className="golvia-field"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field"><label>Birthday</label><input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} /></div>
        <div className="golvia-field"><label>State</label><input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field">
          <label>Gender</label>
          <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option value="">Unspecified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="golvia-field"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: '100%' }} /></div>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <input type="checkbox" checked={form.whatsapp_consent} onChange={e => setForm({ ...form, whatsapp_consent: e.target.checked })} /> WhatsApp consent
        </label>
        <button className="golvia-btn-primary" onClick={createCustomer}>Create</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `CustomerProfile.jsx` in full**

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

function toEditForm(customer) {
  return {
    name: customer.name || '',
    email: customer.email || '',
    whatsapp_consent: !!customer.whatsapp_consent,
    birthday: customer.birthday || '',
    state: customer.state || '',
    gender: customer.gender || '',
    notes: customer.notes || '',
  };
}

export default function CustomerProfile() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  function load() {
    return apiClient.get(`/customers/${id}`).then(setCustomer);
  }

  useEffect(() => { load(); }, [id]);

  if (!customer) return <p className="golvia-page">Loading...</p>;

  function startEditing() {
    setForm(toEditForm(customer));
    setEditing(true);
  }

  async function save() {
    await apiClient.put(`/customers/${id}`, form);
    await load();
    setEditing(false);
  }

  return (
    <div className="golvia-page">
      <h2>{customer.name} <span className="golvia-badge">{customer.membership.tier}</span></h2>

      <div className="golvia-card">
        <p>Phone: {customer.phone} | Email: {customer.email}</p>
        <p>Lifetime coins: {customer.membership.lifetime_coins} | Balance: {customer.membership.current_coin_balance}</p>
        <p>Birthday: {customer.birthday || '—'} | State: {customer.state || '—'} | Gender: {customer.gender || '—'}</p>
        <p>WhatsApp consent: {customer.whatsapp_consent ? 'Yes' : 'No'}</p>
        <p>Notes: {customer.notes || '—'}</p>
        {!editing && <button onClick={startEditing}>Edit</button>}
      </div>

      {editing && form && (
        <div className="golvia-card">
          <h3 style={{ marginTop: 0 }}>Edit customer</h3>
          <div className="golvia-field"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field"><label>Birthday</label><input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} /></div>
          <div className="golvia-field"><label>State</label><input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} style={{ width: '100%' }} /></div>
          <div className="golvia-field">
            <label>Gender</label>
            <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
              <option value="">Unspecified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="golvia-field"><label>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: '100%' }} /></div>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <input type="checkbox" checked={form.whatsapp_consent} onChange={e => setForm({ ...form, whatsapp_consent: e.target.checked })} /> WhatsApp consent
          </label>
          <div className="golvia-toolbar">
            <button className="golvia-btn-primary" onClick={save}>Save</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Vouchers</h3>
        {customer.vouchers && customer.vouchers.length > 0 ? (
          <ul>
            {customer.vouchers.map(v => (
              <li key={v.id}>
                {v.type} — RM{v.value} off (min spend RM{v.min_spend})
                {v.expires_at ? ` — expires ${new Date(v.expires_at).toLocaleString()}` : ''}
              </li>
            ))}
          </ul>
        ) : <p className="golvia-empty">No usable vouchers.</p>}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Purchase history</h3>
        {customer.invoices.length > 0 ? (
          <ul>{customer.invoices.map(i => <li key={i.id}>{i.invoice_number} — RM{i.total} — {i.status}</li>)}</ul>
        ) : <p className="golvia-empty">No purchases yet.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `cd pos-app/client && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 4: Commit**

```bash
git add pos-app/client/src/pages/Customers.jsx pos-app/client/src/pages/CustomerProfile.jsx
git commit -m "feat: restyle customer list and profile pages"
```

---

### Task 7: Dashboard, Sales history, Settings — restyle

**Files:**
- Modify: `pos-app/client/src/pages/Dashboard.jsx`
- Modify: `pos-app/client/src/pages/Invoices.jsx`
- Modify: `pos-app/client/src/pages/Settings.jsx`

**Interfaces:**
- No behavior change — pure restyle, all existing fields/handlers unchanged.

- [ ] **Step 1: Replace `Dashboard.jsx` in full**

```jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => { apiClient.get('/dashboard/summary').then(setSummary); }, []);
  if (!summary) return <p className="golvia-page">Loading...</p>;

  return (
    <div className="golvia-page">
      <h2>Dashboard</h2>

      <div className="golvia-card">
        <p style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--golvia-gold-dark)' }}>
          Today's sales: RM{summary.todaySalesTotal.toFixed(2)}
        </p>
        <p>{summary.todayTransactionCount} transaction(s)</p>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Low stock</h3>
        {summary.lowStockVariants.length > 0 ? (
          <ul>{summary.lowStockVariants.map(v => <li key={v.id}>{v.product_name} — {v.variant_label} ({v.quantity} left)</li>)}</ul>
        ) : <p className="golvia-empty">Nothing low on stock right now.</p>}
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Birthdays today</h3>
        {summary.upcomingBirthdays.length > 0 ? (
          <ul>{summary.upcomingBirthdays.map(c => <li key={c.id}>{c.name}</li>)}</ul>
        ) : <p className="golvia-empty">No customer birthdays today.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `Invoices.jsx` in full**

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  useEffect(() => { apiClient.get('/invoices').then(setInvoices); }, []);
  return (
    <div className="golvia-page">
      <h2>Sales History</h2>
      <div className="golvia-card">
        <table>
          <thead><tr><th>Invoice</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i.id}>
                <td><Link to={`/invoices/${i.id}/receipt`}>{i.invoice_number}</Link></td>
                <td>RM{i.total}</td>
                <td><span className="golvia-badge">{i.status}</span></td>
                <td>{new Date(i.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && <p className="golvia-empty">No sales yet.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `Settings.jsx` in full**

```jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Settings() {
  const [settings, setSettings] = useState({});
  // gmail_app_password is a write-only secret: the server never returns the saved value, so
  // this field always loads empty. Track what the user types this session separately so an
  // untouched field doesn't overwrite the stored password with an empty string on save.
  const [gmailAppPassword, setGmailAppPassword] = useState('');

  useEffect(() => { apiClient.get('/settings').then(setSettings); }, []);

  async function save() {
    const body = { ...settings };
    delete body.gmail_app_password;
    if (gmailAppPassword) body.gmail_app_password = gmailAppPassword;
    await apiClient.put('/settings', body);
    alert('Saved.');
  }

  function downloadCsv(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function exportAll() {
    const files = await apiClient.get('/export/all');
    for (const [filename, content] of Object.entries(files)) {
      downloadCsv(filename, content);
    }
  }

  return (
    <div className="golvia-page">
      <h2>Settings</h2>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Email (Gmail)</h3>
        <div className="golvia-field"><label>Gmail address</label><input value={settings.gmail_address || ''} onChange={e => setSettings({ ...settings, gmail_address: e.target.value })} style={{ width: '100%' }} /></div>
        <div className="golvia-field">
          <label>Gmail app password</label>
          <input type="password" value={gmailAppPassword} placeholder="Leave blank to keep the current password" onChange={e => setGmailAppPassword(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="golvia-btn-primary" onClick={save}>Save</button>
      </div>

      <div className="golvia-card">
        <h3 style={{ marginTop: 0 }}>Data export</h3>
        <button onClick={exportAll}>Export all data</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the build**

Run: `cd pos-app/client && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 5: Commit**

```bash
git add pos-app/client/src/pages/Dashboard.jsx pos-app/client/src/pages/Invoices.jsx pos-app/client/src/pages/Settings.jsx
git commit -m "feat: restyle dashboard, sales history, and settings pages"
```

---

### Task 8: Marketing tab — restyle and fix confusing empty state

**Files:**
- Modify: `pos-app/client/src/pages/Marketing.jsx`

**Interfaces:**
- No behavior change — pure restyle plus a static explanatory message. `GET /api/marketing/pending` and `POST /api/marketing/:customerId/mark-sent` are unchanged.

- [ ] **Step 1: Replace `Marketing.jsx` in full**

```jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export default function Marketing() {
  const [pending, setPending] = useState([]);
  const [loaded, setLoaded] = useState(false);

  function load() {
    return apiClient.get('/marketing/pending').then(p => { setPending(p); setLoaded(true); });
  }

  useEffect(() => { load(); }, []);

  async function sendWhatsApp(customer) {
    try {
      await apiClient.post(`/marketing/${customer.id}/mark-sent`, { triggerType: customer.triggerType });
    } finally {
      window.open(customer.whatsappLink, '_blank');
      load();
    }
  }

  return (
    <div className="golvia-page">
      <h2>Marketing</h2>
      <p style={{ color: 'var(--golvia-text-muted)', fontSize: 13, marginBottom: 20 }}>
        This list only ever shows customers with a birthday <em>today</em>, or who had a new
        reward voucher issued <em>today</em> — it refreshes automatically each day.
      </p>

      <div className="golvia-card">
        {!loaded && <p>Loading...</p>}
        {loaded && pending.length === 0 && (
          <p className="golvia-empty">No marketing actions pending today. Check back tomorrow, or after a customer's next birthday or voucher.</p>
        )}
        {pending.map(c => (
          <div key={`${c.id}-${c.triggerType}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--golvia-border)' }}>
            <p style={{ margin: '0 0 6px' }}>
              <strong>{c.name}</strong> <span className="golvia-badge">{c.triggerType}</span>
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>{c.message}</p>
            <button className="golvia-btn-primary" onClick={() => sendWhatsApp(c)}>Send via WhatsApp</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd pos-app/client && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add pos-app/client/src/pages/Marketing.jsx
git commit -m "feat: restyle marketing tab, add empty-state explanation"
```

---

## Self-Review Notes

- **Spec coverage:** §2 Visual design system (Task 1 + every page task applying its classes), §3 inline customer creation (Task 3), §4 receipt redesign + print fix (Task 4), §5 product images — capture, backfill, display in 3 locations (Tasks 2, 3, 5), §6 Marketing empty state (Task 8) are all covered.
- **Type/interface consistency checked:** `theme.css`'s class names (`.golvia-page`, `.golvia-card`, `.golvia-btn-primary`, `.golvia-field`, `.golvia-badge`, `.golvia-empty`, `.golvia-error`, `.golvia-success`, `.golvia-thumb`, `.golvia-thumb-lg`, `.golvia-toolbar`) from Task 1 are used identically (same names, same expected markup shape) in every later task. `parseStockRows`'s new `image_url` field (Task 2) matches what Task 3/5 expect on `GET /api/products` responses (the route does `SELECT *`, so it flows through automatically — no route change needed for reads, only for the two write endpoints which already accepted `image_url` before this plan). `getInvoiceWithDetails`'s new `customer.tier` field (Task 4) matches exactly what the redesigned `InvoiceReceipt.jsx` reads (`invoice.customer.tier`).
- **No placeholders:** every step contains complete, final file content or exact code — no "style this page nicely" without showing the actual markup/CSS.
