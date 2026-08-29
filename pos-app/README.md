# GOLVIA POS

A single-store point-of-sale system: product catalog with barcode scanning, checkout
with discounts and coin/voucher redemption, receipt printing, returns/refunds, CRM
with membership tiers, WhatsApp/email marketing, an admin dashboard, and automatic
daily backups.

The app is a React client (Vite) talking to an Express + SQLite server. In
production the server also serves the built client, so the whole system runs as a
single Node process on `http://localhost:4173`.

## First-time setup

Run these once, from the `pos-app/` folder, before using the app for the first time.

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Create the admin user

From `pos-app/server`, run:

```bash
node -e "const {getDb}=require('./src/db/db'); const {createAdmin}=require('./src/services/authService'); createAdmin(getDb(),'admin','changeme');"
```

This creates a user with username `admin` and password `changeme`. Log in with these
credentials once the app is running, and change the password from Settings.

### 3. Import the stock list

From `pos-app/server`, run the stock importer against your product spreadsheet:

```bash
node src/services/importStock.js "<path-to-your-stock-file.xlsx>"
```

This populates the product catalog (name, barcode, price, quantity, etc.) from the
`.xlsx` file. Re-run it any time to re-import an updated stock list.

### 4. Configure Gmail credentials

Open the app, log in as admin, and go to **Settings**. Enter the Gmail account and
app password used to send marketing/receipt emails. (Use a Gmail
[App Password](https://myaccount.google.com/apppasswords), not your regular Gmail
password.)

## Day-to-day use

Double-click **`Start GOLVIA POS.bat`** in the `pos-app/` folder.

This will:

1. Build the client on the very first run only (subsequent launches skip the build
   and start instantly, since the built files are cached in `client/dist`).
2. Start the server on port 4173.
3. Open your default browser to `http://localhost:4173`, showing the login screen.

To stop the app, close the console window that opened (or press `Ctrl+C` in it).

### Running without the double-click wrapper

From `pos-app/`:

```bash
node launcher.js
```

This does the same thing as the `.bat` file and works on macOS/Linux too (it opens
the browser with `open`/`xdg-open` instead of `start`).

## Rebuilding the client after an update

The launcher only builds the client if `client/dist` doesn't exist yet. After
pulling code changes to the client, delete the `client/dist` folder (or run
`npm run build` inside `client/`) so the next launch picks up the changes:

```bash
cd client && npm run build
```

## Data and backups

- The SQLite database lives at `server/data/golvia.db`.
- A backup is taken automatically once at server startup and then every 24 hours,
  written to `server/data/backups/`.

## Changing the admin password

The setup account is `admin` / `changeme123`. Change it — especially if the shop
computer is shared:

```bash
cd server && node src/services/setAdminPassword.js admin "your-new-passphrase"
```

You can change the username at the same time by passing a different first
argument. Restart the server afterwards to force a fresh login.

## Hosting it online (optional — read this first)

GOLVIA is built to run **on the shop's own computer**. It stores everything in a
local SQLite file and serves only `127.0.0.1`, so nothing is reachable from the
shop's wifi or the internet. For a single counter, that is the right setup: no
monthly cost, no internet dependency at the till, and customer data never leaves
the premises.

Host it only if you actually need something the local install can't do — such as
checking sales from home, or running a second branch.

### Vercel / Netlify will not work

These platforms run *serverless functions*: short-lived, no persistent disk, no
long-running process. GOLVIA needs all three:

| GOLVIA needs | Serverless gives | Result |
|---|---|---|
| To write sales to a SQLite file | A read-only filesystem, wiped per request | Every sale lost |
| To keep logins in memory | A fresh instance per request | Constant logouts |
| A process alive for backups and hourly voucher checks | Nothing running between requests | Neither ever runs |

Use a platform that runs a persistent Node process with a mounted disk —
**Render, Railway, or Fly.io**. `render.yaml` in the repository root is a working
Render configuration.

### Before exposing it to the internet

1. **Set a real admin password** (above). The server *refuses to start* in public
   mode while the default is still in place.
2. **Attach a persistent disk** and point `DATA_DIR` at it. Without one, the
   database is destroyed on every deploy. Render's free tier has no disks, so
   this needs a paid instance (roughly USD 7/month at the time of writing).
3. **Set `GOLVIA_PUBLIC=1`.** This one switch turns on everything that has to
   move together for a public instance: binding to `0.0.0.0`, `secure` cookies,
   and the trust-proxy setting those cookies need behind the platform's HTTPS.

Be aware of what hosting means: the entire customer database — names, phone
numbers, emails, birthdays, and purchase history — becomes reachable from the
internet, protected by one shared password. There is a single admin account and
no rate limiting on the login endpoint.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GOLVIA_PUBLIC` | unset | `1` enables public-deployment mode (see above) |
| `DATA_DIR` | `server/data` | Where the database and backups live — point at a mounted disk when hosted |
| `DB_PATH` | `$DATA_DIR/golvia.db` | Override the database file path directly |
| `PORT` | `4173` | Port to listen on |
| `HOST` | `127.0.0.1`, or `0.0.0.0` when `GOLVIA_PUBLIC=1` | Interface to bind |
