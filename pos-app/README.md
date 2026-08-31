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
node src/services/setAdminPassword.js admin "your-password-here"
```

⚠️ Replace `your-password-here` with a password you actually choose — the text
above is a placeholder, not the password to use. Minimum 8 characters.

This creates (or updates) the single admin account. Use the same command any time
you want to change the password or the username later — there is no password
change screen inside the app.

### 3. Import the stock list

From `pos-app/server`, run the stock importer against your product spreadsheet:

```bash
node src/services/importStock.js
```

That is the whole command — it finds the `.xlsx` sitting next to the app on its
own and tells you which file it used. Only pass a path if your spreadsheet lives
somewhere else, in which case give the **real** path (in quotes if it contains
spaces):

```bash
node src/services/importStock.js "C:\Users\You\Desktop\GolviaStocksList.xlsx"
```

This populates the product catalogue from the `.xlsx` file. **Re-running it is
safe**: existing products and variants are updated rather than duplicated, so you
can reload an updated spreadsheet whenever prices or descriptions change.

**Stock quantities are deliberately left alone on a re-run.** The database holds
the live count — reduced by every sale and by audited stock adjustments — while
the spreadsheet only has whatever was true when you exported it. Overwriting the
live count with a stale snapshot would silently undo your sales and the till would
then oversell. When you genuinely want the spreadsheet to win (a stock take, say):

```bash
node src/services/importStock.js "D:\path\to\Golvia Stocks List.xlsx" --reset-quantities
```

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

There is no password-change screen in the app; this command is the supported way.
Use it whenever you need to rotate the password — especially if the shop computer
is shared, or if you are sharing the till to other devices:

```bash
cd server && node src/services/setAdminPassword.js admin "your-new-passphrase"
```

You can change the username at the same time by passing a different first
argument. Restart the server afterwards to force a fresh login.

## Using GOLVIA on other devices (phone, tablet, second laptop)

For a sales event where you want to ring up sales from more than one device, you
do **not** need to deploy anything. Double-click:

    Share GOLVIA to other devices.bat

It starts GOLVIA and prints a public HTTPS link like
`https://something-random.trycloudflare.com`. Open that on any device, log in as
usual, and use the till normally.

**Why this instead of hosting it in the cloud:** all of your data lives in one
SQLite file on this computer. A cloud deployment would get its own separate,
empty database — sales rung up there would not show up here, and the two stock
counts would drift apart. That is a real risk during a live event: you would
oversell items. Tunnelling keeps a single source of truth, so it does not matter
which device makes the sale.

**What to know:**

- The link only works while that window stays open. Close it and the link dies.
- You get a **different link every time** you start it. Re-share it each session.
- This computer must stay on and awake — every device is talking to it.
- Anyone with the link reaches your login page, so it is only as private as your
  admin password. Change it first (see above) if that matters to you.
- One-time install if the tunnel tool is missing:
  `winget install --id Cloudflare.cloudflared`

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
