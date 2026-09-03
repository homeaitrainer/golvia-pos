# GOLVIA Local Data, Backup, and Product Sync Design

**Date:** 2026-09-03  
**Status:** Approved in chat; awaiting review of this written specification

## Goal

Keep GOLVIA simple for a non-technical operator while making the shop's local data durable and consistent across every device that connects through the existing Share launcher.

The main Windows computer remains the single application server. A single SQLite database remains the system of record for products, live stock, customers, membership, invoices, refunds, settings, and administrator accounts. A publicly viewable Google Sheet becomes a one-way source for product catalogue details only.

## Confirmed Decisions

- The main computer is expected to remain on while other administrators use GOLVIA.
- PostgreSQL and cloud hosting are out of scope for this version.
- SQLite remains the operational database.
- The three supplied CSV exports are the only legacy data to preserve.
- Missing legacy invoice items, membership balances, vouchers, refunds, settings, and audit history do not need to be reconstructed.
- Google Sheet is the product catalogue source; it is not the transaction database.
- Google Sheet access uses an anyone-with-the-link, read-only URL.
- Product synchronization is manually initiated and always previewed before application.
- Routine product synchronization never changes live inventory quantities.
- The database and backups live outside the Git checkout so application updates cannot overwrite them.

## Selected Architecture

### Application and data locations

The application remains at:

```text
C:\Users\Admin\Documents\Golvia\pos-app
```

Persistent data moves to:

```text
C:\Users\Admin\Documents\GOLVIA Data\
  golvia.db
  backups\
```

Launchers set `DATA_DIR=C:\Users\Admin\Documents\GOLVIA Data` before starting any server-side command. Database code resolves the active database consistently from `DB_PATH`, then `DATA_DIR`, then the existing repository-local default for tests and backward compatibility.

The server enables SQLite foreign keys, WAL journaling, a bounded busy timeout, and an appropriate synchronous mode. Business operations continue to use database transactions.

### Device topology

`Start GOLVIA POS.bat` starts one Express server on the main computer. The local browser and every device connected through `Share GOLVIA to other devices.bat` call that server. No device receives or maintains its own database file.

All successful writes are committed to the same `golvia.db`. Product, stock, customer, invoice, membership, and refund views therefore read the same data on every device.

## Legacy Bootstrap

### Source files

The one-time bootstrap uses:

- `customers (1).csv`: 5 customers
- `products (1).csv`: 112 variant rows belonging to 18 products, with total quantity 4,617
- `invoices (1).csv`: 7 invoice headers, comprising 6 completed and 1 partially refunded invoice

Validation found no duplicate customer IDs, duplicate customer phones, missing required customer fields, blank or duplicate SKUs, negative prices, negative quantities, duplicate invoice IDs, duplicate invoice numbers, or orphaned invoice customer references.

### Import behavior

The bootstrap runs once against a new empty database inside a single transaction.

- Customer IDs are preserved so imported invoice references remain valid.
- Product IDs are preserved where practical; new internal variant IDs are generated because the export does not contain variant IDs.
- SKU remains unique after trimming and case normalization checks.
- Historical invoice numbers and customer links are preserved.
- Imported invoices are marked as legacy records.
- Legacy invoice detail displays an explicit message that line-item details were unavailable in the source export.
- The partially refunded legacy invoice retains its exported status and totals, but no refund-item detail is invented.
- Membership accounts begin at tier `White` with zero lifetime coins and zero current balance.
- No legacy vouchers, refund rows, message logs, stock-adjustment rows, settings, or administrator accounts are inferred.

The import must reconcile to the validated counts before it commits. It runs `PRAGMA foreign_key_check` and `PRAGMA integrity_check` after import. Any mismatch rolls back the new database and leaves the CSV files unchanged.

## Administrator Bootstrap

The new database creates one administrator:

```text
Username: kean.leewk@gmail.com
Temporary password: admin123
Role: Super Admin
```

The password is stored only as a bcrypt hash. A `role` field and a `must_change_password` flag are added to the administrator model. The initial account has `role = 'super_admin'` and `must_change_password = 1`.

After the first successful login, all application routes except logout and password change reject the session until the password is changed. The new password must satisfy the existing minimum length and must not equal the temporary password. This is required because a Cloudflare quick-tunnel URL is internet-accessible while Share is running.

The design does not add staff-account management in this scope. The schema supports a super-administrator role so account management can be added later without another destructive migration.

## Google Sheet Product Source

### Ownership boundary

Google Sheet owns catalogue attributes:

- product name
- display name
- category
- brand
- description
- image URL
- variant label
- SKU
- barcode
- cost price
- selling price

GOLVIA owns operational attributes and records:

- current inventory quantity
- stock-adjustment history
- customers
- membership balances and tiers
- vouchers
- invoices and invoice items
- refunds
- administrators and settings

New products and catalogue edits are made in Google Sheet. Existing product-edit screens remain available for viewing, barcode troubleshooting, and audited stock adjustment, but catalogue fields controlled by Google Sheet are visibly identified. The system must avoid silently allowing two conflicting sources of truth.

GOLVIA never writes customers, invoices, membership data, cost data, or transaction data back to Google Sheet. The public sheet must contain product information only.

### Stable identity

Each variant row requires an immutable `golvia_sync_id`, for example `GV-000001`.

The initial migration generates one sync ID for each of the 112 imported variant rows and produces a Google-Sheet-ready catalogue file containing those IDs. The operator imports or copies that prepared catalogue into the product sheet once.

Future rows require a unique sync ID. Sync preview rejects blank or duplicate IDs. SKU and barcode may then change without creating a new variant because synchronization matches by `golvia_sync_id`, not by the editable SKU.

The database stores the sync ID on the variant and enforces case-insensitive uniqueness. Existing SKU and barcode uniqueness are also validated after trimming and case normalization.

### Sheet configuration

Settings gains a Product Sync section containing:

- a standard Google Sheet URL field
- a saved sheet/tab identifier when required
- `Check for updates`
- last successful sync time and summary

The server converts the normal shared link into Google's CSV export URL. Only Google Sheets URLs for the expected document shape are accepted. Redirects, unexpected content types, oversized responses, missing headers, and network timeouts produce a clear error and make no database changes.

### Required columns

The prepared sheet uses stable headers:

- `golvia_sync_id`
- `product_name`
- `short_name`
- `category`
- `brand`
- `product_description`
- `main_image`
- `variation_value`
- `seller_sku`
- `barcode`
- `Cost`
- `price`
- `quantity`

The `quantity` column is retained for initial setup and explicit stocktake workflows, but routine sync ignores it.

### Preview and apply

`Check for updates` downloads and validates the current sheet, then returns a preview without writing:

- new products/variants
- changed catalogue fields
- unchanged rows
- rows missing from the sheet
- validation errors

The preview shows old and new values for each change. It never displays or changes live quantity during routine sync.

Validation blocks application when any row has:

- a blank or duplicate sync ID
- a blank or duplicate SKU
- a duplicate non-empty barcode
- a missing product name
- a nonnumeric or negative cost/price
- required headers missing
- a sync ID that conflicts with more than one database row

Rows missing from the sheet are reported for review and never automatically deleted or deactivated. Historical invoice references must remain intact.

On confirmation, the server:

1. verifies that the submitted preview token still represents the latest fetched sheet content;
2. creates a full database backup;
3. reapplies validation;
4. performs all catalogue changes in one transaction;
5. records a sync audit summary;
6. commits only if every change succeeds.

If any step fails, the transaction rolls back and the previous catalogue remains active.

An explicit stocktake mode may be designed later. It is not part of routine product sync and is not required for this implementation.

## Backup and Restore

### Backup policy

Full SQLite backups are written under `C:\Users\Admin\Documents\GOLVIA Data\backups`. CSV exports remain available for reporting but are not labelled as backups.

Backups occur:

- on server startup;
- once every 24 hours while the server remains running;
- before applying a Google Sheet synchronization;
- before restoring another backup;
- before applying an application update.

Backup names contain local date and time so multiple backups on one day do not overwrite one another. Backups older than 30 days are pruned only after a new backup completes successfully.

The implementation uses SQLite's online backup facility or an equivalent consistent snapshot mechanism rather than copying a potentially changing database file. A completed backup is checked for integrity before it is reported as successful.

### User-facing tools

Two launchers are added:

```text
Backup GOLVIA Data.bat
Restore GOLVIA Data.bat
```

Manual backup can run while the server is active through a safe server-side backup command. Restore refuses to proceed while port 4173 or the database is in use, lists available dated backups, validates the selected file, backs up the current database, replaces it atomically, and verifies the restored file. It then instructs the operator to restart GOLVIA.

Failures never delete the current database or the selected backup. Messages use plain language and include the exact recovery action.

## Safe Application Updates

A new `Update GOLVIA POS.bat` provides the supported update path. It:

1. checks that it is running from the expected Git checkout;
2. creates and verifies a full database backup;
3. verifies there are no conflicting local code edits;
4. pulls the configured GitHub branch with fast-forward-only behavior;
5. installs locked server and client dependencies;
6. builds the client;
7. reports success or the exact failed step.

It never deletes or rewrites `C:\Users\Admin\Documents\GOLVIA Data`. A code update failure leaves the database untouched. Destructive Git reset behavior is not used.

## Launchers

### Start GOLVIA POS

The Start launcher:

- sets the persistent data directory;
- checks required Node dependencies and gives a direct setup message when missing;
- opens or initializes the database;
- runs schema migrations;
- runs integrity and foreign-key checks;
- creates a verified startup backup;
- starts the local server;
- opens the local browser.

If the database is corrupt or the backup fails, startup stops before accepting sales and identifies the newest valid backup.

### Share GOLVIA to other devices

The Share launcher first checks `http://127.0.0.1:4173` for a healthy GOLVIA server. If the server is not running, it tells the user to start GOLVIA and exits without opening a tunnel.

When healthy, it creates the existing Cloudflare quick tunnel. Closing Share disables remote access but does not stop the local server. Every remote request still reaches the same main-computer process and database.

## Cross-Device Refresh

Database writes are immediately durable, but an already open browser view also needs to learn that another device changed data.

The server exposes an authenticated lightweight event stream. After successful mutations it publishes a non-sensitive event type such as `products_changed`, `stock_changed`, `customers_changed`, or `invoices_changed`. Clients reconnect automatically and refresh only the relevant current data.

The stream contains no customer details, prices, credentials, or transaction payloads. It is a refresh signal, not a second source of data. If the stream disconnects, ordinary API requests continue to work and the client retries with bounded backoff.

## Error Handling and Safety

- No preview operation writes to the database.
- No failed import or sync partially applies changes.
- No missing sheet row automatically deletes a product.
- Routine sync never overwrites live stock.
- No CSV text is executed or interpreted as instructions.
- Database, CSV, and Google Sheet values are treated as untrusted input and validated.
- Public-sheet fetches have host allowlisting, response-size limits, timeouts, and content validation.
- Passwords are never logged or exported.
- Backup and restore errors retain both current and candidate database files.
- Existing invoice references survive product catalogue changes.

## Verification Plan

Automated tests use temporary databases and fixture copies, never the production data directory.

### Bootstrap verification

- Imports exactly 5 customers.
- Imports exactly 18 products and 112 variants.
- Reconciles total initial quantity to 4,617.
- Imports exactly 7 legacy invoice headers.
- Preserves invoice-to-customer coverage.
- Marks missing line-item detail clearly.
- Creates the super administrator with a bcrypt hash and forced password change.
- Passes SQLite integrity and foreign-key checks.

### Product sync verification

- Preview is read-only.
- New sync IDs create variants once.
- Repeated sync is idempotent.
- Changing SKU or barcode on an existing sync ID updates the same variant.
- Duplicate or blank sync IDs, SKUs, and barcodes are rejected.
- Invalid numeric fields are rejected.
- Routine sync leaves every quantity unchanged.
- Missing sheet rows do not delete database records.
- Sheet changes between preview and confirm invalidate the preview.
- A forced failure rolls back the entire sync.
- A verified backup exists before a successful apply.

### Backup, restore, and update verification

- Multiple same-day backups have distinct names.
- Backup integrity checks pass.
- Retention removes only backups older than 30 days and only after success.
- Restore refuses while the server is active.
- Restore backs up the current database first.
- Backup, mutate, restore returns all checked records to the backup state.
- Application update leaves the external data directory unchanged.

### Multi-device verification

- Two simulated clients write through the same server and observe one database state.
- Concurrent stock-affecting operations retain valid quantities and invoice relationships.
- A mutation event causes another client to refresh relevant data.
- Event-stream interruption does not block sales or ordinary API calls.
- Share refuses to start without a healthy local server.

## Rollout

1. Preserve the three source CSV files unchanged.
2. Build and test migrations, bootstrap, backups, restore, and product sync against temporary data.
3. Generate the Google-Sheet-ready product catalogue with sync IDs.
4. Create the external production data directory.
5. Bootstrap and validate the new production database.
6. Have the operator import/copy the prepared catalogue into the shared Google Sheet and paste its URL into Settings.
7. Run a preview-only sync and review all reported changes.
8. Test local login, forced password change, product lookup, stock adjustment, and one test sale.
9. Test Share from a second device and cross-device refresh.
10. Create a final verified backup before live use.

## Out of Scope

- PostgreSQL or another hosted database
- always-on access while the main computer is off
- using Google Sheet as an invoice, customer, membership, or inventory database
- writing GOLVIA transactions back to Google Sheet
- automatic deletion of products missing from the sheet
- automatic routine quantity synchronization
- reconstructing missing historical invoice items, refunds, vouchers, or membership balances
- staff-account administration UI
- automatic cloud backup storage

