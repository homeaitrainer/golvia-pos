# GOLVIA POS Handover

## Read This First

Continue from the isolated local-development worktree below. Do not restart from the repository root and do not rebuild the completed foundation.

- Worktree: `C:/Users/Admin/Documents/Golvia/.worktrees/golvia-membership-local`
- Branch: `codex/golvia-membership-local`
- Handover base commit before this file: `16792a8eb3626f12ffcdb7e66466f75240e05171`
- Remote: `origin` → `https://github.com/homeaitrainer/golvia-pos.git`
- Current state: paused by the user after Task 2
- Production/staging deployment: not started and not authorized

The branch has local commits and had no upstream tracking branch at the time of handover. Verify before assuming it exists on GitHub:

```powershell
git -c safe.directory=C:/Users/Admin/Documents/Golvia/.worktrees/golvia-membership-local status --short
git -c safe.directory=C:/Users/Admin/Documents/Golvia/.worktrees/golvia-membership-local branch -vv
```

## Primary Sources of Truth

Read these before changing code:

1. `HANDOVER.md` — this operational handover.
2. `docs/progress/2026-09-08-golvia-membership.md` — completed deliverables and verification counts.
3. `docs/superpowers/plans/2026-09-07-golvia-membership-local.md` — approved Task 1–7 implementation plan.
4. `docs/superpowers/specs/2026-09-07-golvia-nexopos-platform-design.md` — wider POS platform design.
5. `nexopos/GOLVIA-PATCHES.md` and `nexopos/UPSTREAM.md` — pinned NexoPOS/core-patch boundaries.
6. `.superpowers/sdd/2026-09-07-golvia-membership-local/progress.md` — ignored local SDD execution ledger, if the worktree still contains it.

Research reports may exist only in the baseline worktree because they are intentionally ignored:

- `C:/Users/Admin/Documents/Golvia/.worktrees/nexopos-baseline-cpanel/.superpowers/local-membership-research/modules.md`
- `C:/Users/Admin/Documents/Golvia/.worktrees/nexopos-baseline-cpanel/.superpowers/local-membership-research/pos-hooks.md`

## Product Decisions Already Approved

- NexoPOS 6.2.2 is the base. GOLVIA features are implemented as the independent `GolviaMembership` module.
- Keep NexoPOS runtime core unchanged unless a documented extension gap proves a minimal patch unavoidable.
- One branch/counter, MYR, timezone `Asia/Kuala_Lumpur`.
- Coins do not expire.
- Earn `floor(eligible original merchandise subtotal / RM3)` coins; default is one coin per RM3.
- Redeem 100 coins as RM1.
- Lifetime tiers: White 0–3000, Silver 3001–5000, Gold 5001–12000, Platinum 12001+.
- Tier member discounts are configurable and default to 0%.
- A mandatory refund reversal may create a negative available-coin balance if earned coins were already spent. Further debits are blocked until the deficit is cleared. Lifetime earned coins may never be negative.
- Locked/deactivated accounts reject earning, redemption, and manual operations but still accept auditable system refund compensation.
- Monthly vouchers are cumulative by tier, all usable each month, but only one voucher is allowed per order.
- Voucher can combine with coins and an admin discount.
- Birthday voucher: RM10, no minimum spend, birthday only, once per year; 29 February uses 28 February in a non-leap year.
- Full refund restores voucher/coins used and reverses earned coins. Partial refund reverses returned-item earning, restores used coins proportionally, and does not restore the voucher.
- MyInvois is phase 2.
- Do not migrate the legacy customers, orders, coins, or vouchers. Products/opening stock will be handled later.

## Completed Work

### Task 1 — Module and accounting schema

Completed and passed specification plus quality reviews.

Commits:

- `8a2c04c8` — scaffold module
- `2b42db23` — harden foundation contracts
- `690f1241` — close mutation/test-isolation gaps

Delivered:

- Recognizable `nexopos/modules/GolviaMembership/` module and provider.
- Versioned financial rules, tiers, membership accounts, coin transactions, and settings-audit tables.
- Default tier/rule seeding and module permissions.
- Unique idempotency and `(account, action, source type, source ID)` protection.
- Non-null immutable rule snapshot on every future ledger entry.
- Append-only/retained Eloquent protections, including bulk mutation APIs.
- Retry-safe seeds, fail-closed permission collisions, cashier POS-summary-only access, and transactional tests.

Verification at completion:

- Focused: 14 tests / 183 assertions, passed twice consecutively.
- Full GOLVIA suite: 15 tests / 189 assertions.

Accepted boundary: raw `DB` SQL sits outside portable Eloquent append-only guards. Keep raw writes confined to reviewed migrations/services. Do not claim engine-level immutability unless MySQL/MariaDB-specific triggers are deliberately introduced and tested later.

### Task 2 — Settings, tiers, and recalculation

Implementation and specification review passed. A separate final code-quality review is still required because the previous reviewer stopped due to a temporary usage limit.

Commits:

- `9e8a1e12` — configurable rules and tiers
- `b0f0b3db` — automatic tier recalculation

Delivered:

- Module-owned authenticated settings/tier API; native settings autoload is disabled.
- Decimal-string MYR storage and integer-sen service boundaries; no float calculations.
- Immutable effective-dated versions and append-only audits.
- Tier topology validation and exact approved boundary tests.
- Activation actor/time/audit.
- Bounded after-commit recalculation job plus every-minute module command fallback.
- PK-ordered resumable progress, failure state, and account `tier_evaluated_at`.

Verification at completion:

- Focused settings/tier tests: 12 tests / 99 assertions.
- Full GOLVIA suite: 27 tests / 288 assertions.
- PHP lint and diff checks passed before commit.
- Specification re-review passed after `b0f0b3db`.

## Exact Resume Point

Do not start Task 3 immediately.

1. Run a fresh Task 2 code-quality review for range `690f12411..b0f0b3db`.
2. Focus on queue/scheduler behavior, `DB::afterCommit`, concurrent activation, single-active-version guarantees, effective-version selection, audit integrity, chunk failure/resume, migration portability, and authorization.
3. Fix review findings with strict TDD, then repeat specification/quality review until both pass.
4. Update the progress document and ignored SDD ledger to mark Task 2 complete.
5. Only then begin Task 3 from the approved plan.

## Remaining Local Plan

- Task 3: customer membership account provisioning, Malaysian phone normalization/lookup, duplicate/conflict reporting, and idempotent backfill.
- Task 4: transactional coin ledger service for earn/redeem/restore/reverse/admin-adjust/reconcile.
- Task 5: secure cashier lookup and administrative member/coin APIs.
- Task 6: professional responsive NexoPOS-native Membership panel and settings UI.
- Task 7: lifecycle, package, migration, full-suite, frontend-build, browser, and security verification.

Later plan series still required:

- Monthly and birthday voucher definitions/issuance.
- Checkout integration, one-voucher enforcement, coins, member/admin discounts, and concurrency.
- Full/partial refund compensation.
- CRM/consent/communications.
- Quotation, SST, receipt/invoice, and later MyInvois.
- Product/opening-stock import, branding, staging, and production cutover.

## Test Environment and Commands

The current worktree's ignored `nexopos/vendor` is a Windows junction to the baseline worktree's installed dependencies. Composer's generated PSR-4 map may contain the baseline path; some tests explicitly load current-worktree module classes. A fresh normal `composer install` will regenerate correct paths.

Run from `C:/Users/Admin/Documents/Golvia/.worktrees/golvia-membership-local/nexopos`:

```powershell
& 'C:/xampp/php/php.exe' -d extension=gd -d extension=intl -d extension=zip -d extension=sodium vendor/bin/phpunit --no-coverage --testsuite Golvia
```

Focused examples:

```powershell
& 'C:/xampp/php/php.exe' -d extension=gd -d extension=intl -d extension=zip -d extension=sodium vendor/bin/phpunit --no-coverage --filter MembershipModuleSchemaTest
& 'C:/xampp/php/php.exe' -d extension=gd -d extension=intl -d extension=zip -d extension=sodium vendor/bin/phpunit --no-coverage --filter 'MembershipSettingsTest|MembershipTierTest'
```

Use `git -c safe.directory=C:/Users/Admin/Documents/Golvia/.worktrees/golvia-membership-local ...` for Git commands in the sandboxed account. `modules/*` is ignored by upstream NexoPOS rules, so add only the intended module path explicitly/forcibly when committing; never force-add all ignored files.

## NexoPOS Integration Findings That Must Not Be Forgotten

- Module Web/API routes do not inherit all core authentication automatically. Web routes require explicit `Authenticate` and `NsRestrictMiddleware`; API routes require explicit `auth:sanctum` and `NsRestrictMiddleware`.
- Core reward points are a mutable counter and lack symmetric refund reversal; they are not GOLVIA's ledger.
- Core coupons allow multiple coupons and do not provide sufficient authoritative minimum/value enforcement; GOLVIA vouchers need their own server validation.
- `OrderAfterCheckPerformedEvent` can reject an order but cannot reliably mutate the caller's order fields.
- NexoPOS order edits may also fire a `created` event. Database idempotency/source uniqueness is mandatory.
- Order/refund events occur inside retried transactions; GOLVIA financial listeners must stay synchronous and idempotent.
- Final full/partial refund status is updated later. Derive compensation from persisted refund rows/remaining quantities, not the event order's current status.
- Sale receipts can be overridden. Refund receipt summary and professional quotation require module-owned routes/views unless a separately documented minimal hook patch is approved.

## Deployment and Security State

- Local development is allowed; cPanel deployment remains **NO-GO**.
- The host exposed no cPanel Terminal, and authorized SSH connections were refused on the tested endpoints.
- Do not deploy by merely uploading a frontend build. Laravel also needs Composer dependencies, `.env`, app key, migrations, writable storage/cache, public/module assets, scheduler, and possibly a queue worker.
- Do not commit `.env`, passwords, database dumps, cPanel session URLs, cookies, private keys, test databases, caches, `vendor`, or `node_modules`.
- The temporary cPanel key `golvia_codex_temp_20260907` remains authorized. Revoking/deleting it requires a new explicit user confirmation at action time. Never modify the user's separate `id_rsa` key.
- The current cPanel database is staging/disposable; the user intends to create a new production database later.

## Handover Prompt for the Next Task

Use this prompt verbatim if useful:

> Read `HANDOVER.md`, `docs/progress/2026-09-08-golvia-membership.md`, and `docs/superpowers/plans/2026-09-07-golvia-membership-local.md`. Work only in `C:/Users/Admin/Documents/Golvia/.worktrees/golvia-membership-local` on branch `codex/golvia-membership-local`. First perform the pending Task 2 code-quality review for `690f12411..b0f0b3db`; do not start Task 3 until Task 2 passes both reviews. Keep NexoPOS runtime core unchanged, use strict TDD and task-by-task review, update progress after each completed task, and do not operate cPanel or deploy.
