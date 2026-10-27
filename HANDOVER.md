# Creatiq POS System — Public Handover

Updated 2026-10-27. Product: **Creatiq POS, by Creatiq AI**.

## Purpose and resume boundary

This is a public, high-level product and engineering handoff. It is not an installation guide or a complete application snapshot. Obtain the complete project and authorized operating instructions from the project owner before implementation work.

The current owner instruction is project organization and handover only. Do not interpret this documentation update as authorization to buy services, change infrastructure, migrate data or start another feature milestone.

## Product scope

- One account can enter explicitly authorized POS businesses, with independent business data.
- Product Retail is the first MVP: product/variant catalogues, reviewed inventory operations, checkout, receipts, returns, shifts and daily reporting.
- Services is planned for salons, spas and wellness centers: service duration, staff/resource availability, appointments and conflict protection, arrival/completion and checkout.
- Services, public subscriptions and AI reporting are not completed features.
- English-first blue/white interface, Creatiq AI branding and consistent reusable UI components.
- Advanced loyalty, prepaid packages, complex commission and additional industry-specific engines remain outside the first MVP.

## Engineering direction

- Retain the Laravel/PHP and MySQL foundation and existing transactional safeguards.
- Separate the central account/authorization service from business operational data.
- Use server-controlled business identity, least-privilege database credentials and independently scoped sessions, files, cache and background jobs.
- Preserve retry-safe payment/refund handling and authoritative stock and receipt records.
- Keep reviewed migrations and deployment/version records; test changes against disposable fixtures.
- Existing proof/checkpoint identifiers are compatibility names and must not be globally renamed as a branding exercise.

## Verification and readiness

Retail software and synthetic end-to-end preview workflows have verification evidence. This does not establish production availability, universal hardware compatibility or banking settlement verification. Operator-recorded Card/QR entries are distinct from gateway-confirmed payments.

Production acceptance remains incomplete. It requires actual off-server backup and failure-alert delivery, restored-application verification, shop device checks, a controlled authoritative cutover and real trading acceptance. Simulated activity must not be counted as real trading days.

The organization task reran 52 UI model tests and 22 prototype workflow checks successfully, plus workspace/package/document integrity checks. These are scoped checks, not a fresh full hosted or financial regression.

## Next steps, only after new owner authorization

1. Validate production compatibility, isolation and licence obligations.
2. Establish managed hosting/database, backup/restore, email, workers and monitoring.
3. Complete a controlled retail MVP pilot before general release.
4. Build one reference salon/spa Services MVP.
5. Add subscription lifecycle and read-only conversational reporting after the operational core is stable.

No infrastructure recommendation is a completed purchase or migration. Recheck platform capabilities and prices before procurement.

## Release and confidentiality

Preserve upstream licence/copyright and third-party UI notices. Resolve the imported NexoPOS licence metadata discrepancy and commercial distribution obligations before promising a proprietary white-label release.

Keep credentials, customer records and environment-specific operations material out of public repositories. This public document deliberately contains no operational access instructions.
