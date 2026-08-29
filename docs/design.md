# GOLVIA POS — Design Reference

**Reference:** the SaaS admin dashboard mockup provided by the user (dark left sidebar,
light content area, stat-card row, card-based data tables, charts).

**Adaptation principle:** GOLVIA is a jewellery *retail counter* tool, not an agency
project-management SaaS. We adopt the reference's **shell, layout language, and data
presentation patterns** — not its feature set. Nothing about projects, leads, negotiation
pipelines, or multi-currency belongs here.

Everything below is the target. Items marked *(existing)* are already in place and unchanged.

---

## 1. What we take from the reference (and what we don't)

| Reference element | Verdict | Why |
|---|---|---|
| Dark left sidebar with icon+label nav | **Adopt** | Scales better than a top bar, frees full width for the Checkout screen, and reads as real business software |
| Stat-card row (icon + big number + label) | **Adopt** | Dashboard is currently plain text lists; this is the single biggest readability win |
| Card-based content sections | *(existing)* | `.golvia-card` already does this |
| Colored status pills | *(existing)* | `.golvia-badge` already does this |
| Line/area chart for trend | **Adopt (simplified)** | One 7-day sales bar chart, drawn with plain CSS — no charting library |
| Donut chart / "Awards" panel | **Skip** | No GOLVIA data maps to it; would be decoration |
| Search box in top bar | **Skip** | Each page already has its own scoped search; a global one has nothing to search |
| Light/Dark mode toggle | **Skip** | Doubles the styling surface for no counter-staff benefit |
| Multi-currency / language switcher | **Skip** | Single shop, MYR only |
| Progress bars in tables | **Skip** | Nothing in a retail sale has "% complete" |

---

## 2. Layout shell

Replaces the current top navigation bar.

```
┌────────────┬─────────────────────────────────────────┐
│            │  Topbar: page name        admin · Logout │
│  GOLVIA    ├─────────────────────────────────────────┤
│            │                                         │
│ ▸ Checkout │   .golvia-page                          │
│ ▸ Dashboard│   (existing page content, unchanged)    │
│ ▸ Products │                                         │
│ ▸ Customers│                                         │
│ ▸ Sales    │                                         │
│ ▸ Marketing│                                         │
│ ▸ Settings │                                         │
└────────────┴─────────────────────────────────────────┘
```

- **Sidebar** — 220px, navy (`--golvia-nav-bg`), full height. Brand wordmark at top,
  then nav items. Each item is an inline SVG icon + label. The active route is
  highlighted with a teal left-edge bar and a lighter background.
- **Topbar** — white, thin, holds the current page name on the left and the logged-in
  user + Logout on the right (the reference's user chip, minus the avatar image and
  the locale switchers).
- **Content** — the existing `.golvia-page` wrapper, widened from 1000px to 1200px and
  left-aligned instead of centred, since the sidebar now provides the left margin.

**Narrow screens (<900px):** the sidebar collapses to icons only (60px). No drawer, no
hamburger — the counter runs on a desktop/tablet, and an always-visible icon rail stays
usable without adding a whole responsive navigation mode.

**Icons:** inline SVG (Feather-style stroke paths), written directly into a small
`Icon.jsx` component. Deliberately **not** an icon font or icon package — same reasoning
as the existing no-web-font rule: the base UI must render fully offline.

---

## 3. Dashboard redesign

The page that gains the most from the reference. Current state is three unstyled lists.

**Row 1 — four stat cards** (the reference's headline pattern):

| Card | Value | Icon tint |
|---|---|---|
| Today's Sales | `RM{todaySalesTotal}` | teal |
| Transactions | `todayTransactionCount` | blue |
| Low Stock Items | `lowStockVariants.length` | amber |
| Birthdays Today | `upcomingBirthdays.length` | purple |

Each card: a tinted circular icon, the value in large bold type, a small muted label —
directly mirroring the reference's `24 / Completed Project` cards.

**Row 2 — 7-day sales chart.** Plain CSS bars (one per day, height proportional to that
day's net sales), day-of-week labels beneath, hover tooltip showing the exact amount.
Needs a new endpoint (§4). No charting library: a 7-bar chart is ~20 lines of CSS, and a
library would be a large dependency for one visual.

**Row 3 — the two existing lists** (Low stock, Birthdays today), kept as-is in their
cards, with their existing empty states. They stay because they're actionable detail the
stat cards only summarise.

---

## 4. Server change

One new read-only endpoint:

```
GET /api/dashboard/sales-trend
→ [{ date: 'YYYY-MM-DD', total: <net sales for that local day> }, ...]   // 7 entries, oldest first
```

Net of refunds, using the **same local-day boundary discipline** as the existing
`/summary` endpoint (`created_at` is stored as a UTC ISO string, but "today" must be
derived from local date components — this shop is UTC+8, and SQLite's `date('now')` is
UTC, so they disagree for the first 8 hours of each local day). Reuses the existing
`localDayBoundaries` helper's approach rather than reintroducing that bug.

Day labels are formatted **client-side** from the `date` string (parsed as
`'YYYY-MM-DDT00:00:00'` to force local-time parsing), so they follow the browser's locale
and can't drift a day from a UTC-parsing mistake.

No other API changes. No business logic, money calculation, auth, or schema changes.

---

## 5. New design tokens

Added to `theme.css` alongside the existing palette:

```css
--golvia-sidebar-w: 220px;
--golvia-shadow: 0 1px 3px rgba(15, 39, 67, 0.06);
--golvia-tint-teal:   #e3f6f2;  --golvia-ink-teal:   #0e7d6b;
--golvia-tint-blue:   #e6f0fb;  --golvia-ink-blue:   #2563a8;
--golvia-tint-amber:  #fdf1dd;  --golvia-ink-amber:  #a8710f;
--golvia-tint-purple: #efe9fb;  --golvia-ink-purple: #6741b5;
```

The four tint/ink pairs give the stat-card icons the reference's varied colour treatment
while staying within one coherent palette. Existing tokens are unchanged.

---

## 6. Explicitly out of scope

- No changes to Checkout, Products, Customers, Invoices, Receipt, Marketing, or Settings
  page *content* — they only inherit the new shell.
- No business-logic, money-calculation, auth, or database-schema changes.
- No new runtime dependency (no chart library, no icon package, no web font).
- Printing is unaffected: the receipt's existing `@media print` rules additionally hide
  the sidebar and topbar so the paper output is unchanged.
