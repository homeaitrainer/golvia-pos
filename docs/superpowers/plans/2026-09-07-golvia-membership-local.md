# GOLVIA Membership Local Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Each task follows strict test-first development and receives specification and quality review before the next task.

**Goal:** Build the first locally testable `GolviaMembership` NexoPOS module with configurable membership rules, lifetime tiers, member accounts, and an auditable coin ledger, while keeping NexoPOS runtime core unchanged.

**Architecture:** The module lives at `nexopos/modules/GolviaMembership/` and owns all GOLVIA data, permissions, routes, services, views, and compiled assets. NexoPOS customers remain the identity source; a one-to-one sidecar membership account stores cached balances and tier state, while an append-only ledger is the accounting source of truth. Financial rules and tiers are versioned, effective-dated module records rather than mutable core options. All mutations are transactional, server-authoritative, idempotent, and permission-protected.

**Tech Stack:** NexoPOS 6.2.2, Laravel 12, PHP 8.2+, MySQL/MariaDB-compatible migrations, PHPUnit 11, Vue 3 shared runtime, Tailwind/Vite module assets.

**Research:** `.superpowers/local-membership-research/modules.md` and `.superpowers/local-membership-research/pos-hooks.md` (ignored working evidence)

**Depends on:** `docs/superpowers/plans/2026-09-07-nexopos-baseline-cpanel.md` Tasks 1–5. The cPanel deployment gate remains NO-GO and is not bypassed by local completion.

## Approved Business Contract for This Plan

- One branch/counter, MYR, timezone `Asia/Kuala_Lumpur`.
- Coins never expire.
- Default earning rule: each completed order earns `floor(eligible original merchandise subtotal / RM3)` coins.
- Default redemption rule: 100 coins equals RM1.
- Lifetime tier thresholds: White 0–3000, Silver 3001–5000, Gold 5001–12000, Platinum 12001 and above.
- Per-tier member discount is configurable and defaults to 0%.
- Membership rules must be editable from the POS administration panel with server-side validation and an audit trail for financial mutations.
- Voucher issuance/redemption, checkout application, payment-completion earning, and refund reversal are later plans. This plan supplies the stable APIs and ledgers they will consume.
- MyInvois is phase 2 and is not implemented here.

## Non-Negotiable Engineering Constraints

- Do not change NexoPOS runtime core files. If a proven extension gap appears, stop and record it before proposing a minimal patch.
- Every module web route explicitly uses `Authenticate` and `NsRestrictMiddleware`; every module API route explicitly uses `auth:sanctum` and `NsRestrictMiddleware`.
- Never trust client-provided balance, tier, conversion rate, or adjustment result.
- Coin balances use integers. Monetary settings use decimal strings/integers at boundaries, never binary floating-point arithmetic.
- Ledger rows are append-only. Corrections are compensating entries, not updates or deletes.
- Every mutation has both a unique idempotency key and a database-enforced unique source action; it runs inside a database transaction with `lockForUpdate()` on the membership account.
- Cached balances/lifetime totals must reconcile exactly to ledger sums.
- Mandatory system refund reversals may make available coins negative when previously earned coins have already been spent. A negative balance blocks further redemption/manual debits until later earning or restoration clears it; lifetime-earned coins may never be negative.
- Locked/deactivated accounts reject earning, redemption, and manual operations, but still accept idempotent system refund compensation.
- Tests use the real application container and SQLite where possible, plus migration SQL review for MySQL/MariaDB compatibility.

## Public Module Interfaces

```php
MembershipAccountService::ensureForCustomer(int $customerId): MembershipAccount
TierResolver::resolve(int $lifetimeEarnedCoins): MembershipTier
CoinLedgerService::earn(MembershipAccount $account, int $coins, LedgerSource $source): CoinTransaction
CoinLedgerService::redeem(MembershipAccount $account, int $coins, LedgerSource $source): CoinTransaction
CoinLedgerService::restore(MembershipAccount $account, int $coins, LedgerSource $source): CoinTransaction
CoinLedgerService::reverseEarn(MembershipAccount $account, int $coins, LedgerSource $source): CoinTransaction
CoinLedgerService::adjust(MembershipAccount $account, int $delta, string $reason, LedgerSource $source, int $authorId): CoinTransaction
CoinLedgerService::reconcile(MembershipAccount $account): ReconciliationResult
```

`LedgerSource` carries non-empty `type`, non-empty `id`, and `idempotencyKey`. A repeated key or repeated `(account, action, source type, source ID)` returns the existing transaction only when the complete payload fingerprint matches; otherwise it throws a conflict exception. Manual adjustments generate an immutable operation UUID as their source ID.

---

### Task 1: Create the Installable Module, Permissions, and Schema

**Files:**
- Create: `nexopos/modules/GolviaMembership/config.xml`
- Create: `nexopos/modules/GolviaMembership/GolviaMembershipModule.php`
- Create: `nexopos/modules/GolviaMembership/Providers/GolviaMembershipServiceProvider.php`
- Create: `nexopos/modules/GolviaMembership/Migrations/2026_09_07_000001_create_membership_foundation.php`
- Create: `nexopos/modules/GolviaMembership/Models/MembershipAccount.php`
- Create: `nexopos/modules/GolviaMembership/Models/MembershipTier.php`
- Create: `nexopos/modules/GolviaMembership/Models/CoinTransaction.php`
- Create: `nexopos/modules/GolviaMembership/Models/MembershipRuleVersion.php`
- Create: `nexopos/modules/GolviaMembership/Models/SettingsAudit.php`
- Test: `nexopos/tests/Feature/Golvia/MembershipModuleSchemaTest.php`

**Schema:**

- `golvia_membership_rule_versions`: immutable earning/redemption settings, effective timestamp, activation/recalculation state, actor, timestamps.
- `golvia_membership_tiers`: rule-version ID, stable key, name, inclusive minimum, nullable inclusive maximum, decimal discount percent, display order, active flag, timestamps. Referenced/versioned tiers are deactivated, never hard-deleted.
- `golvia_membership_accounts`: unique customer ID without a cascading foreign key, unique membership number, normalized phone/index, status, BIGINT available coin balance, BIGINT lifetime-earned coin total, current tier ID, joined timestamp, timestamps.
- `golvia_coin_transactions`: account/customer IDs, signed BIGINT balance/lifetime deltas and snapshots, constrained action string, source type/ID, unique idempotency key, payload fingerprint, reason, nullable system author ID, rule-version snapshot/ID, JSON metadata, timestamps. Unique `(account_id, action, source_type, source_id)` prevents duplicate event accounting even when callers generate different idempotency keys.
- `golvia_membership_settings_audits`: rule version, old/new JSON values, actor, effective timestamp, timestamps.
- Seed permissions idempotently: POS summary, administrative read, manage, adjust coins, manage tiers, manage settings. Assign administrative permissions to admin/store-admin only; cashier receives only POS summary.

- [ ] Write failing tests proving module discovery metadata, migration up/down, defaults, unique customer/account constraints, unique idempotency and source-action constraints, payload fingerprints, BIGINT columns, non-cascading retention, append-only guards, allowed actions/statuses, and permission creation.
- [ ] Run the focused tests and capture the expected failures.
- [ ] Implement the minimum entry class, provider, migration, and models.
- [ ] Run focused tests, the Golvia suite, and `git diff --check`.
- [ ] Commit: `feat: scaffold GOLVIA membership module`

---

### Task 2: Add Validated Settings and Configurable Lifetime Tiers

**Files:**
- Create: `nexopos/modules/GolviaMembership/Settings/MembershipSettings.php`
- Create: `nexopos/modules/GolviaMembership/Services/MembershipSettingsService.php`
- Create: `nexopos/modules/GolviaMembership/Http/Requests/UpdateMembershipSettingsRequest.php`
- Create: `nexopos/modules/GolviaMembership/Http/Controllers/MembershipSettingsController.php`
- Create: `nexopos/modules/GolviaMembership/Services/TierResolver.php`
- Create: `nexopos/modules/GolviaMembership/Http/Requests/UpdateTierRequest.php`
- Create: `nexopos/modules/GolviaMembership/Http/Controllers/TierController.php`
- Create: `nexopos/modules/GolviaMembership/Routes/api.php`
- Test: `nexopos/tests/Feature/Golvia/MembershipSettingsTest.php`
- Test: `nexopos/tests/Feature/Golvia/MembershipTierTest.php`

**Settings fields:** enabled; earning spend amount (default RM3.00); coins earned (1); redemption coins (100); redemption value (RM1.00). Reject zero/negative values. Store money as normalized decimal strings and expose integer sen to services. Set the settings class `AUTOLOAD=false`; module-owned GET/PATCH endpoints enforce `golvia.membership.manage-settings`, create immutable effective-dated versions, and append audit rows.

**Tier rules:** preserve the approved default thresholds but allow authorized administration changes. Validation rejects overlaps, gaps, duplicate keys, negative thresholds/discounts, discounts above 100%, and more than one open-ended tier. Activation never rewrites historical ledgers. Account recalculation is a resumable, idempotent, primary-key-ordered chunked job/command with visible pending/completed state; it does not lock the full member base inside the settings request.

- [ ] Write failing settings default/validation, effective-date/audit/version immutability, chunked activation, and tier boundary/overlap/authorization tests.
- [ ] Prove unauthenticated API requests fail and authenticated users without the module permission receive 403.
- [ ] Implement the settings page/service, resolver, tier API, and explicit route middleware.
- [ ] Verify exact boundaries 0, 3000, 3001, 5000, 5001, 12000, and 12001.
- [ ] Commit: `feat: configure membership rules and tiers`

---

### Task 3: Provision and Maintain Customer Membership Accounts

**Files:**
- Create: `nexopos/modules/GolviaMembership/Services/MembershipAccountService.php`
- Create: `nexopos/modules/GolviaMembership/Services/MalaysianPhoneNormalizer.php`
- Create: `nexopos/modules/GolviaMembership/Services/MembershipLookupService.php`
- Create: `nexopos/modules/GolviaMembership/Listeners/CreateMembershipAfterCustomerCreated.php`
- Create: `nexopos/modules/GolviaMembership/Listeners/RefreshMembershipAfterCustomerUpdated.php`
- Create: `nexopos/modules/GolviaMembership/Console/Commands/BackfillMembershipAccounts.php`
- Test: `nexopos/tests/Feature/Golvia/MembershipAccountTest.php`

**Behavior:** new customer creation ensures one active account; repeated/dispatched-twice events are harmless; existing customers can be backfilled idempotently; membership numbers are unique and non-secret; deleting/deactivating a customer never deletes coin history. Tier is derived only from lifetime-earned coins. Malaysian `012…`, `6012…`, and `+6012…` formats normalize to the same indexed identity. Backfill reports conflicts without guessing a winner. Before claiming cross-path duplicate prevention, prove a pre-write customer hook; if none exists, record the core extension gap and keep lookup/conflict detection authoritative.

- [ ] Write failing tests using real NexoPOS customer events, duplicate event dispatch, backfill reruns, phone format equivalence, conflicting customers, and concurrent ensure attempts.
- [ ] Implement `ensureForCustomer()` with unique constraints and race-safe retry.
- [ ] Implement synchronous typed listeners and the idempotent backfill command.
- [ ] Verify no core customer table is altered.
- [ ] Commit: `feat: provision membership accounts for customers`

---

### Task 4: Implement the Append-Only Coin Ledger

**Files:**
- Create: `nexopos/modules/GolviaMembership/Data/LedgerSource.php`
- Create: `nexopos/modules/GolviaMembership/Data/ReconciliationResult.php`
- Create: `nexopos/modules/GolviaMembership/Exceptions/InsufficientCoinsException.php`
- Create: `nexopos/modules/GolviaMembership/Exceptions/IdempotencyConflictException.php`
- Create: `nexopos/modules/GolviaMembership/Services/CoinLedgerService.php`
- Test: `nexopos/tests/Feature/Golvia/CoinLedgerServiceTest.php`

**Accounting invariants:** earn changes available and lifetime totals positively; redeem changes available only negatively; restore changes available only positively; reverse-earn changes available and lifetime totals negatively, permits an available-balance deficit when spent earnings must be refunded, and never permits lifetime below zero; admin adjustment changes available only and requires author/reason. Every ledger row stores the immutable rule/version snapshot used. Tier recalculation follows each lifetime mutation in the same transaction.

- [ ] Write failing tests for every action, insufficient funds, negative-balance refund reversal, deficit redemption blocking/earning recovery, exact idempotent replay, same source with a different key, conflicting replay, integer overflow, rollback, account status semantics, tier crossing/demotion, and reconciliation mismatch.
- [ ] Implement a single private append path with DB transaction, row lock, payload fingerprint, snapshots, and unique-key conflict handling.
- [ ] Make ledger model updates/deletes throw and prove it in tests.
- [ ] Run focused tests repeatedly to expose state leakage.
- [ ] Commit: `feat: add auditable GOLVIA coin ledger`

---

### Task 5: Expose Secure Member and Coin Administration APIs

**Files:**
- Create: `nexopos/modules/GolviaMembership/Http/Requests/AdjustCoinsRequest.php`
- Create: `nexopos/modules/GolviaMembership/Http/Controllers/MembershipController.php`
- Create: `nexopos/modules/GolviaMembership/Http/Controllers/CoinAdjustmentController.php`
- Update: `nexopos/modules/GolviaMembership/Routes/api.php`
- Test: `nexopos/tests/Feature/Golvia/MembershipApiTest.php`

**Endpoints:** a cashier-safe phone/member-number lookup returning only ID, display name, tier and balance under `pos-summary`; separate administrative paginated/searchable member list, profile/history and reconciliation under `read`; authorized coin adjustment under `adjust-coins`. Responses never accept or expose a writable cached balance. Adjustment requires a bounded non-zero integer delta, reason, authenticated author, and client idempotency key.

- [ ] Write failing authentication, authorization, validation, search, pagination, adjustment, replay, and audit-author tests.
- [ ] Implement controllers/requests/resources with explicit middleware and server-side service calls.
- [ ] Verify read permission cannot adjust and cashier cannot access settings/tier mutations.
- [ ] Commit: `feat: add secure membership administration API`

---

### Task 6: Build the Professional Membership Panel

**Files:**
- Create: `nexopos/modules/GolviaMembership/Routes/web.php`
- Create: `nexopos/modules/GolviaMembership/Http/Controllers/MembershipPageController.php`
- Create: `nexopos/modules/GolviaMembership/Filters/MembershipMenu.php`
- Create: `nexopos/modules/GolviaMembership/Listeners/RenderMembershipAssets.php`
- Update: `nexopos/modules/GolviaMembership/Providers/GolviaMembershipServiceProvider.php`
- Create: `nexopos/modules/GolviaMembership/Resources/Views/index.blade.php`
- Create: `nexopos/modules/GolviaMembership/Resources/Views/settings.blade.php`
- Create: `nexopos/modules/GolviaMembership/Resources/Views/footer.blade.php`
- Create: `nexopos/modules/GolviaMembership/Resources/ts/main.ts`
- Create: `nexopos/modules/GolviaMembership/Resources/ts/components/MembershipPanel.vue`
- Create: `nexopos/modules/GolviaMembership/Resources/ts/components/MembershipSettings.vue`
- Create: `nexopos/modules/GolviaMembership/package.json`
- Create: `nexopos/modules/GolviaMembership/vite.config.js`
- Test: `nexopos/tests/Feature/Golvia/MembershipPageTest.php`

**UX:** clean responsive NexoPOS-native visual language; fast search; member summary cards; tier progress; ledger table with action/source/date; accessible empty/loading/error states; guarded adjustment dialog; settings validation shown inline. Use semantic theme tokens, keyboard focus, and shared Vue runtime—no second Vue bundle.

- [ ] Write failing route/menu/auth/view asset-contract tests.
- [ ] Implement authenticated pages, provider-registered permission-filtered menu, typed render-footer listener, exactly-once shared-runtime asset injection, and API-driven Vue components.
- [ ] Build module assets and verify the manifest contains JS/CSS entries.
- [ ] Run a browser smoke test at desktop and tablet widths when the local app is available.
- [ ] Commit: `feat: add GOLVIA membership administration panel`

---

### Task 7: Package and Verify the Local Foundation

**Files:**
- Create: `nexopos/modules/GolviaMembership/README.md`
- Create: `docs/verification/golvia-membership-local.md`
- Update: `.gitignore` only if generated module artifacts are not already ignored safely

- [ ] Run migration up/down/up against the test database.
- [ ] Exercise a real one-root module zip through isolated upload install, migration, enable, public asset link, disable-with-data-preservation, version update, and destructive deletion rollback tests.
- [ ] Run all `Tests\\Feature\\Golvia` tests and the full upstream PHPUnit suite.
- [ ] Run the module production asset build and inspect the manifest.
- [ ] Run PHP formatting/lint, frontend checks, `git diff --check`, and a secret scan.
- [ ] Reconcile seeded/fixture accounts and prove all report zero variance.
- [ ] Document exact local install/enable/migrate/build commands and the remaining cPanel NO-GO deployment gate.
- [ ] Package a deterministic module zip containing compiled `Public/build` assets but excluding `.env`, test databases, caches, `node_modules`, or private keys.
- [ ] Commit: `docs: verify local membership foundation`

## Acceptance Gate for Plan 3

Plan 3 (monthly/birthday vouchers) may start only when:

1. module install, enable, migrate, disable, and migration rollback are tested;
2. authentication/authorization tests pass for every route;
3. ledger replay, conflict, insufficient balance, rollback, and reconciliation tests pass;
4. approved tier boundaries and settings defaults are executable tests;
5. no NexoPOS runtime core file changed;
6. full upstream PHPUnit remains green;
7. module assets build locally from a clean checkout;
8. the verification report clearly states that production deployment is still blocked until hosting execution requirements are verified.
