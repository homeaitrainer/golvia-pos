# GOLVIA NexoPOS Platform Design

## 1. Purpose

GOLVIA will replace its current custom POS implementation with NexoPOS as the operational foundation. NexoPOS will provide the standard retail capabilities, while GOLVIA-specific membership, coins, vouchers, customer engagement, branding, SST, quotation, and reporting behavior will be delivered through isolated extensions.

The design optimizes for cashier usability, cPanel compatibility, safe upgrades, auditable reward balances, and a clean start with a new production database. The current SQLite customer, sales, coin, and voucher data will not be migrated. Existing product and opening-stock data will be imported after validation.

## 2. Confirmed Decisions

- Use NexoPOS under its applicable open-source license as the POS core.
- Do not preserve the current GOLVIA user interface.
- Do not rewrite NexoPOS core unless an extension point is genuinely unavailable.
- Implement GOLVIA behavior in a versioned module or small set of cohesive modules.
- Host the production system at `https://pos.golvia.my` on the existing cPanel account if the hosting preflight passes.
- Use the existing cPanel MySQL/MariaDB database and privileged application user. Credentials remain only in the server environment file.
- Start with a new database. Do not migrate old customers, sales, coins, or vouchers.
- Import products, variants, SKUs, barcodes, prices, and opening stock from the supplied product workbook.
- Support SST and quotation workflows.
- Keep membership configuration editable by an administrator.
- Allow one voucher per order. Allow that voucher to be combined with coin redemption and an administrator discount.

## 3. Delivery Boundaries

This is a platform migration composed of separate subprojects. Each subproject must be deployable and testable without requiring unfinished later phases.

1. Hosting and NexoPOS baseline
2. GOLVIA membership and reward ledger
3. Checkout and refund integration
4. Voucher issuance and scheduled automation
5. Customer CRM and consented communications
6. SST, quotation, invoice, and receipt configuration
7. Product import and reconciliation
8. Staging, acceptance, and production cutover

Daily check-in is excluded from the first release because it currently has no defined reward. Monthly vouchers are not conditional on check-ins or seven qualifying visits. Repairs, exchanges, deposits, down payments, gold trade-in, referrals, and historical data migration are also excluded.

## 4. Source and Upgrade Strategy

### 4.1 Upstream ownership

The official NexoPOS repository is the upstream source. GOLVIA will pin a stable release and record the exact version used in production. Development will occur in a GOLVIA-owned repository that preserves the upstream license and notices.

### 4.2 Extension policy

GOLVIA-specific behavior will use NexoPOS module, event, filter, service-provider, route, migration, permission, and UI-extension mechanisms supported by the pinned release. Core files remain unmodified by default.

If a core modification is unavoidable, it must be:

- isolated as the smallest possible patch;
- documented with the upstream file and reason;
- protected by an automated regression test;
- checked against each NexoPOS upgrade;
- proposed upstream when generally useful.

### 4.3 Upgrade process

Upgrades are first applied to a disposable or staging installation. The automated suite and the cashier acceptance checklist must pass before production is updated. Database backups are taken before migrations, and the previous deployable application release remains available for rollback.

## 5. System Architecture

```text
Browser on POS computer, tablet, or phone
                    |
                 HTTPS
                    |
             pos.golvia.my
                    |
     cPanel Apache/PHP application runtime
                    |
       NexoPOS core and GOLVIA modules
          |                    |
     MySQL/MariaDB        cPanel Cron
          |                    |
 orders, stock, CRM      voucher issuance
 reward ledgers          birthday issuance
 audit records           expiry processing
```

NexoPOS remains authoritative for products, stock, customers, orders, payments, registers, refunds, and standard reports. The GOLVIA module is authoritative for membership configuration, tier membership, coin transactions, customer vouchers, reward issuance, and the relationship between these records and NexoPOS orders/refunds.

## 6. Hosting Preflight Gate

No production deployment begins until the pinned NexoPOS release is checked against the actual cPanel account. The check covers:

- supported PHP version and required PHP extensions from `composer.json`;
- supported MySQL or MariaDB version;
- ability to install Composer dependencies, through Terminal/SSH or an offline build upload;
- ability to point the subdomain document root to the Laravel `public` directory without exposing `.env`, source, storage, or vendor internals;
- writable Laravel storage and cache directories;
- Cron Jobs with the frequency required by Laravel scheduling;
- SSL issuance and forced HTTPS;
- outbound email capability;
- PHP memory, execution-time, upload-size, disk, inode, and database limits;
- database backup and restore access;
- URL rewriting and queue behavior required by the pinned release.

The current empty domain and database are not considered a successful application deployment. If the preflight fails, the design remains valid but the runtime moves to a compatible managed PHP host or VPS while the domain points to it.

## 7. GOLVIA Module Boundaries

### 7.1 Membership Configuration

Administrators can configure:

- coin earning ratio;
- coin redemption ratio;
- whether earning uses original, discounted, or paid value;
- coin expiry policy;
- tier names, colors, ordering, minimum lifetime coins, and discount rates;
- voucher definitions and tier eligibility;
- birthday reward value, minimum spend, and validity window;
- maximum vouchers per order;
- whether vouchers, coins, member discounts, and administrator discounts can combine;
- rule effective dates.

The initial configuration is:

| Setting | Initial value |
|---|---:|
| Coin earning | 1 coin per RM3 original merchandise value |
| Coin earning rounding | Floor to a whole coin per completed order |
| Coin redemption | 100 coins equals RM1 |
| Coin expiry | None |
| Vouchers per order | 1 |
| Voucher plus coins | Allowed |
| Voucher plus administrator discount | Allowed |
| Member discount | 0 percent for every tier until configured |

Changes are effective-dated. A completed order retains the rules and monetary values used at checkout; changing settings never recalculates historical transactions.

### 7.2 Membership Accounts

Each member is linked one-to-one with a NexoPOS customer and stores:

- current coin balance;
- lifetime coins earned net of refunded earning reversals;
- current tier;
- tier evaluation date;
- membership enrollment date;
- birthday and birthday-reward history;
- marketing consent state and recorded time;
- optional jewelry notes such as ring size, preferred designs, anniversary, and repair history notes.

Phone number is the primary cashier lookup. Phone values are normalized before uniqueness checks so Malaysian formats such as `012...`, `6012...`, and `+6012...` do not silently create duplicate members.

### 7.3 Coin Ledger

Coin balances are derived from an immutable transaction ledger rather than being maintained only as editable counters. Transaction types include:

- sale earning;
- redemption;
- full-refund reversal;
- partial-refund earning reversal;
- partial-refund redemption restoration;
- administrator credit or debit;
- opening adjustment, if ever needed.

Every entry records the customer, signed coin amount, transaction type, related order/refund, rule snapshot, administrator when applicable, timestamp, and an idempotency key. Direct balance edits are prohibited. Administrator adjustments require a reason and create an audit entry.

Tier calculation uses lifetime coins after refund reversals. Spending coins does not lower lifetime coins. A refund can lower lifetime coins and therefore can lower the tier if the corrected lifetime total crosses a threshold.

### 7.4 Tier Configuration

Initial tier thresholds are:

| Tier | Lifetime coins |
|---|---:|
| White | 0 to 3,000 |
| Silver | 3,001 to 5,000 |
| Gold | 5,001 to 12,000 |
| Platinum | 12,001 and above |

Threshold validation prevents overlaps, gaps, duplicate ordering, or a maximum below its minimum. Only one active tier can match a customer at a time.

### 7.5 Voucher Definitions and Customer Vouchers

A voucher definition describes a reusable reward rule. A customer voucher is a uniquely issued instance with a code and lifecycle.

Customer-voucher states are `scheduled`, `available`, `reserved`, `redeemed`, `expired`, `restored`, and `voided`. Reservation occurs during checkout submission so the same voucher cannot be used simultaneously on two devices.

Initial monthly issuance by tier is cumulative:

| Tier | Monthly vouchers issued |
|---|---|
| White | RM3 with RM50 minimum spend |
| Silver | White rewards plus RM5 with RM100 minimum spend |
| Gold | Silver rewards plus RM8 with RM150 minimum spend |
| Platinum | Gold rewards plus RM10 with RM200 minimum spend |

Each eligible member receives every listed voucher once per calendar month. An issuance uniqueness constraint on customer, definition, and issuance period prevents duplicate creation if the scheduler retries.

An order can redeem at most one customer voucher. Eligibility is checked server-side for ownership, state, date, minimum spend, order scope, and any configured product/category restrictions.

### 7.6 Birthday Reward

Every member is eligible for one RM10 birthday voucher per calendar year. It has no minimum spend, becomes available at the start of the registered birthday in `Asia/Kuala_Lumpur`, and expires at the end of that calendar day. A uniqueness constraint on customer and birthday year prevents duplicates.

For a 29 February birthday in a non-leap year, the reward is issued for 28 February. Changing a birthday after a reward is issued does not generate a second reward for the same year. Birthday changes are audited.

## 8. Checkout and Pricing

### 8.1 Authoritative calculation

The server calculates all totals from stored product prices and active rules. Browser calculations are previews only.

The initial calculation order is:

1. Calculate original merchandise subtotal from authoritative prices.
2. Calculate the member-tier discount if its configured rate is above zero.
3. Apply administrator line or order discount within the administrator's permission.
4. Validate and apply at most one voucher.
5. Validate and apply the requested coin redemption.
6. Calculate SST on the legally configured taxable basis.
7. Calculate the final payable amount, never below RM0.

The exact placement and rounding of SST is configuration-driven and must be approved using the applicable Malaysian tax treatment before production. Currency values are stored and calculated using fixed-precision decimal types, not floating-point arithmetic.

Coins earned equal `floor(original eligible merchandise subtotal / 3)` under the initial rule, regardless of member discount, administrator discount, voucher, coin redemption, or payment method. A guest sale earns no coins.

### 8.2 Atomic completion

Order creation, stock deduction, voucher redemption, coin redemption, coin earning, membership update, payment recording, and audit entries complete in one database transaction. If any part fails, none of these state changes commit.

Voucher and membership rows are locked or otherwise protected using database-supported concurrency controls during checkout. Repeated submissions use an idempotency key so a double-click or network retry does not create a second order or duplicate reward entries.

### 8.3 Receipt presentation

The receipt and invoice show, when applicable:

- GOLVIA company identity and address;
- invoice number;
- cashier and customer;
- product variant, quantity, unit price, and line amount;
- member discount and administrator discount separately;
- voucher code and value;
- coins redeemed and MYR value;
- subtotal, SST basis/rate/amount, total, and payment methods;
- coins earned and resulting balance;
- quotation reference or original invoice reference for related documents.

## 9. Refunds

Refunds reference the original order and specific refundable quantities. The system prevents cumulative refund quantity or amount from exceeding the original sale.

### 9.1 Full refund

A full refund:

- restores returned stock;
- restores all coins redeemed by the order;
- reverses all coins earned by the order from both current and lifetime totals;
- restores the redeemed voucher with its original expiry date if that date has not passed;
- marks an already-expired restored voucher as expired rather than extending it;
- recalculates the tier;
- preserves the original order and creates linked refund and audit records.

### 9.2 Partial refund

A partial refund:

- restores the returned item quantities;
- reverses earned coins based on the original value of the returned items;
- restores redeemed coins proportionally using a deterministic fixed-precision allocation;
- allocates the final remainder on the last refund so total restored coins exactly matches the original redemption;
- does not restore the voucher;
- recalculates the tier;
- preserves all order and refund records.

Refund execution is idempotent and transactional.

## 10. Scheduled Jobs

cPanel Cron invokes Laravel's scheduler at the supported interval. Scheduled commands include:

- issue monthly tier vouchers;
- issue birthday vouchers;
- expire vouchers;
- queue or create member notifications;
- perform application health checks and record failures.

Every scheduled job is safe to retry. A missed run can be replayed for a defined period without duplicate issuance. Operational failures are visible in an administrator status screen and server log.

## 11. Customer Communications

WhatsApp marketing requires explicit consent. The initial delivery mechanism may use click-to-chat with an administrator-editable template, avoiding dependence on an external paid API. The module separates message composition from delivery so a future Meta Cloud API or other provider can replace click-to-chat without changing reward logic.

Templates exist for birthday reward, monthly voucher issuance, tier change, receipt sharing, and general promotion. A message log records customer, channel, template/trigger, consent status at send time, operator, and timestamp. Automated messaging is not enabled until the chosen provider, consent wording, and failure handling are configured.

## 12. Quotations, SST, Invoices, and MyInvois Readiness

Quotations support creation, editing, expiry configuration, customer assignment, printing/sharing, and conversion into a sale without re-entering lines. Conversion records the source quotation and revalidates current price, stock, discounts, voucher, coins, and SST rather than silently trusting stale quotation values.

SST configuration supports registration identity, rate, taxable categories, rounding, effective dates, and receipt/invoice display. Because the final registered number, applicable rate, and taxable-product classifications are not yet provided, the platform supports these fields but production checkout cannot claim SST compliance until they are configured and acceptance-tested.

The data model preserves the customer identity, tax classification, invoice adjustment, refund, and source-document information needed for a future MyInvois integration. A real MyInvois submission adapter is a separate compliance subproject and is not treated as complete merely because SST appears on a receipt.

Invoice numbering uses `INV-YYYY-0001` as the initial display format. Number allocation is server-side, unique, concurrency-safe, and never reused after cancellation or refund.

## 13. Product Import

The importer accepts the existing workbook and produces a dry-run report before writing data. It validates:

- required names and prices;
- duplicate or malformed SKU and barcode values;
- variant relationships and weight labels;
- cost and selling-price precision;
- category and brand mapping;
- opening quantity and low-stock thresholds;
- image references where supplied.

The real import is repeatable. Product descriptive fields and prices may be updated by a later import, but live stock is not overwritten unless the administrator explicitly runs an opening-stock or stocktake mode. An import report records created, updated, skipped, and rejected rows.

## 14. Security and Audit

The initial installation may expose only an administrator role, but permissions remain explicit rather than relying on one shared credential. Sensitive operations include discounting, voiding, refunding, editing stock, adjusting coins, changing membership rules, and viewing/exporting customer data.

Security controls include:

- HTTPS-only production access;
- strong password hashing through the framework;
- rate-limited authentication;
- secure session cookies and CSRF protection;
- server-side authorization on every sensitive action;
- secrets stored outside the public document root;
- no database credentials committed to source control;
- audit logs for settings, coins, vouchers, stock, refunds, and customer consent;
- least-privilege database and filesystem access;
- dependency and NexoPOS security-update review.

## 15. Backup and Recovery

Production backup covers both the MySQL/MariaDB database and uploaded product/branding files. Backups run daily, are retained on a defined rotation, and include at least one copy outside the hosting account so a compromised cPanel account cannot erase every backup.

A backup is not accepted until a restore rehearsal succeeds in staging. Before application or database migrations, an additional pre-deploy backup is taken. Recovery instructions identify the backup location, restore sequence, environment configuration, and validation checks.

## 16. Error Handling and Operations

Cashier-facing errors use clear recovery messages and never expose stack traces or secrets. Expected cases include insufficient coins, voucher becoming unavailable, stock changing during checkout, duplicate payment submission, printer failure, and network interruption.

The confirmed order state is always determined by the server. If a browser loses the response after submission, it queries by idempotency key before allowing a retry. Receipt printing failure does not reverse a completed sale; the receipt remains reprintable.

Administrator diagnostics show scheduler health, last successful voucher jobs, failed jobs, database connectivity, storage writability, and application version.

## 17. Testing Strategy

### 17.1 Automated tests

- unit tests for tier boundaries, coin rounding, redemptions, voucher eligibility, SST rounding, and refund allocations;
- integration tests for transactional checkout, concurrency, idempotency, scheduled issuance, expiration, and refund reversal;
- authorization tests for every administrator-only action;
- import tests for duplicates, malformed data, repeat runs, and stock-protection behavior;
- upgrade tests against the pinned NexoPOS version and each proposed update.

### 17.2 Acceptance tests

Acceptance uses the actual barcode scanner, receipt printer, desktop browser, phone, and tablet. Critical scenarios are:

1. member sale with one voucher, coins, and administrator discount;
2. tier change after earning coins;
3. full refund with voucher and coin restoration;
4. partial refund with proportional coin restoration and no voucher restoration;
5. simultaneous attempts to use one voucher;
6. monthly and birthday jobs run twice without duplicate rewards;
7. quotation conversion with changed price or stock;
8. SST receipt/invoice calculation and display;
9. interrupted checkout response followed by safe recovery;
10. backup restoration into staging.

## 18. Environments and Release Flow

Development uses local sample data. Staging uses a separate database and URL or access-controlled path. Production uses `pos.golvia.my` and the production database only after acceptance.

The release flow is:

1. build and test locally;
2. deploy to staging;
3. run database migrations and automated tests;
4. execute cashier and hardware acceptance;
5. back up production;
6. deploy the approved release;
7. run smoke tests;
8. monitor checkout, scheduler, and error logs;
9. roll back the application and restore only when required by a failed migration procedure.

## 19. Completion Criteria

The first production release is complete when:

- the hosting preflight passes;
- stock NexoPOS workflows operate without core modifications or every exception is documented;
- product and opening stock import reconcile by SKU and barcode;
- membership, coin, tier, voucher, birthday, checkout, and refund tests pass;
- SST and quotation acceptance tests pass with the final business configuration;
- actual printer and scanner tests pass;
- HTTPS, permissions, audit logging, cron monitoring, and external backups are active;
- a staging restore rehearsal succeeds;
- the owner completes a representative sale, refund, register close, and report review.

## 20. Implementation Sequence

Implementation will proceed as separate reviewed plans in this order:

1. cPanel preflight and pinned NexoPOS baseline;
2. membership configuration, accounts, and immutable coin ledger;
3. voucher definitions, issuance, birthday rewards, and scheduler;
4. checkout integration and atomic reward processing;
5. refund integration and exact reversal allocation;
6. customer CRM, consent, and communications;
7. quotation, SST, invoice, and receipt configuration;
8. product importer and reconciliation tooling;
9. branding and usability refinement;
10. staging deployment, security hardening, backup rehearsal, and production cutover.

Each plan has its own tests and acceptance gate. Later work does not begin by editing production directly.
