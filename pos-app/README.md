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
