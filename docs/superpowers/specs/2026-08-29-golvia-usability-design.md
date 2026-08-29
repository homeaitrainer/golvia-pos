# GOLVIA POS — Usability Overhaul Design Spec

Date: 2026-08-29
Status: Approved by user (all three tiers, auto-shortened product names)

## 1. Why

The system is functionally complete and correct, but slow and confusing to *operate*.
Findings below came from driving the running app and measuring, not from inspection.

**Tier 1 — breaks the job**

1. **The cashier cannot see what to charge.** Checkout displays only the pre-discount
   `Subtotal`. Item discounts, lump-sum discount, voucher, and coin redemption are all
   invisible until after the sale is committed, on the receipt. There is no way to tell
   the customer the amount before taking payment. Affects every sale.
2. **Search results bury the cart.** Searching `s` renders 112 add-buttons across 18
   products — a 2,663px results block that pushes the cart 1,915px below the fold
   (measured at 1440×900). The existing GSAP "added to cart" flash fires off-screen,
   so adding an item appears to do nothing. No result cap; no input debounce (one API
   call per keystroke).
3. **Quantity cannot be set.** Selling five of an item means clicking *add* five times.
   No stepper, no quantity field.

**Tier 2 — slow and error-prone**

4. Product names are 100+ character marketplace SEO titles, wrapping 3–4 lines in the
   products list, search results, cart, and receipt.
5. Stock adjustment uses browser `prompt()` dialogs; cancelling yields a delta of `0`
   rather than aborting.
6. Completing a sale gives no confirmation — the screen simply becomes a receipt.
7. The products list "Variants" column is a wall of 30+ comma-separated names.

**Tier 3 — polish**

8. Prices are not tabular-aligned, so numeric columns wobble.
9. No loading state on customer "Look up".
10. `alert()` on Settings save.
11. Cart rows have no column headers and ragged alignment.

## 2. Non-goals

- No change to pricing, coin, voucher, tier, refund, or auth logic. The server stays
  authoritative for money; the client only *previews*.
- No visual-drama pass. This is a counter tool: the wins are fewer clicks and never
  scrolling mid-sale. (The installed `design-taste-frontend` skill self-scopes to
  "landing pages, portfolios… **not** dashboards, data tables, or multi-step product
  UI", so it is deliberately not applied wholesale. Its transferable craft rules —
  tabular figures, one gray family, aligned shared elements, designed empty/loading
  states — are adopted.)
- No new runtime dependency beyond what is already installed (GSAP is present).

## 3. Checkout: two-column layout

The structural change that resolves findings 1–3 together.

```
┌──────────────────────────────┬────────────────────────────┐
│ Scan / Search  (left, flows) │  ORDER PANEL (right,       │
│                              │  sticky, always visible)   │
│  ┌────────────────────────┐  │                            │
│  │ results, max-height,   │  │   Cart (qty steppers)      │
│  │ scrolls INSIDE itself  │  │   Customer                 │
│  └────────────────────────┘  │   Discounts & Payment      │
│                              │   ── TOTAL TO COLLECT ──   │
│                              │   [ Complete Sale ]        │
└──────────────────────────────┴────────────────────────────┘
```

- Left column: scan field, search field, and results. **Results live in their own
  scroll container** (`max-height`, `overflow-y: auto`) so they can never push the
  order panel off-screen regardless of match count.
- Right column: fixed width (~380px), `position: sticky`, holding cart → customer →
  discounts/payment → total → Complete Sale. The cart is therefore *always* on screen,
  which is what makes the add-to-cart animation meaningful.
- Below 1100px the columns stack (order panel first, so the total stays reachable).

**Search behaviour:** 250ms debounce; results capped at 8 products with a
"showing 8 of N — refine your search" note. Variant buttons show label + price only.

## 4. Live "Total to Collect"

A new client-side pricing module (`client/src/pricing.js`) mirrors
`server/src/services/checkoutService.js`'s calculation **in the same order**, since
that order is load-bearing (each cap depends on the previous one):

1. `subtotal = Σ sell_price × qty`
2. `itemDiscountTotal = Σ clamp(itemDiscount, 0, lineValue)`
3. `afterItemDiscounts = subtotal − itemDiscountTotal`
4. `lumpSum = clamp(percent ? afterItemDiscounts × v/100 : v, 0, afterItemDiscounts)`
5. `remainingAfterDiscounts = afterItemDiscounts − lumpSum`
6. `coinDiscount = min(coins / 100, max(0, remainingAfterDiscounts))`
7. `voucherDiscount = min(voucher.value, max(0, remainingAfterDiscounts − coinDiscount))`
8. `total = max(0, subtotal − (itemDiscountTotal + lumpSum + voucherDiscount) − coinDiscount)`

This is a **preview only** — the server recomputes authoritatively from its own
`sell_price`, and its result is what the receipt shows. The module is unit-tested
against the same cases as the server, and carries a comment naming the server function
it mirrors so the two are maintained together.

The panel shows a breakdown (Subtotal, each discount that is non-zero, Coins, Voucher)
and then **Total to Collect** in large tabular figures. The number animates on change.

## 5. Quantity control

Each cart row gets a `− [n] +` stepper plus a direct numeric input. Decrementing to 0
removes the line (with the same confirmation-free behaviour as today's Remove button,
which is retained). Quantity is clamped to the variant's available stock, with an
inline "only N in stock" hint when the cap is hit — surfacing the same limit the server
enforces, before the cashier reaches Complete Sale.

## 6. Product display names

A `short_name` column is added to `products`.

- **Derivation:** take everything before the first `|`, then strip a leading
  `GOLVIA JEWELLERY` (case-insensitive — the source data uses both
  `GOLVIA JEWELLERY` and `GOLVIA Jewellery`) and a leading `*`, and collapse the
  doubled spaces present in some rows. `"GOLVIA JEWELLERY Cincin Eksklusif Adjustable |
  Korean Style Women Ring…"` → `"Cincin Eksklusif Adjustable"`. If the result is empty,
  fall back to the full name.
  The gram weight in parentheses is **kept** — for jewellery a 54g bracelet is a
  different item from a 19g one, so it is product identity rather than marketing filler:
  `"GOLVIA JEWELLERY (37.0g) Gelang Lipan Kikir | …"` → `"(37.0g) Gelang Lipan Kikir"`.
- Applied on import, backfilled for existing rows (never overwriting a non-empty
  value), and **editable** in the product form.
- Used everywhere staff or customers read a product: products list, checkout search,
  cart, and receipt. The full `name` is retained in the database and shown on the
  product edit page.

## 7. Remaining fixes

- **Stock adjust:** replace `prompt()`/`alert()` with an inline form (quantity delta +
  reason) validated before submit; cancel genuinely aborts.
- **Sale confirmation:** a brief success state on the receipt page confirming the sale
  and the amount collected, so completion is unambiguous.
- **Products list variants:** show a count plus total stock (`12 variants · 486 in
  stock`) with low-stock ones called out, replacing the comma wall.
- **Polish:** `font-variant-numeric: tabular-nums` on all money and quantity cells;
  loading state on "Look up"; a small toast replacing `alert()`; cart column headers
  and right-aligned numerics.

## 8. Motion

Within the established 150–250ms budget, and only where it confirms an action:
cart row slides in on add; the Total figure counts up/down when it changes; a brief
success check on Complete Sale. Respects the existing `prefers-reduced-motion` guard.
