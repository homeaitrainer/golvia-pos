# GOLVIA POS — UI Polish & Feature Completion Design Spec

Date: 2026-08-28
Status: Approved by user, ready for implementation planning

## 1. Overview & Goals

Following the initial build of the GOLVIA POS system, the user identified one
real bug, one missing feature, one confusing-but-working screen, and asked
for the whole app to move from functional-but-unstyled to a branded, polished
look. This spec covers all four:

1. A shared visual design system applied across every screen.
2. Inline "add new customer" at checkout (currently missing — checkout can
   only look up an existing customer by phone, with no way to create one
   without leaving the screen).
3. A redesigned, branded A5 receipt.
4. Product images: capturing them on import and displaying them in the
   catalog and at checkout.
5. A small clarity fix for the Marketing tab, which is empty by design
   (only shows today's birthdays/vouchers) but currently gives no
   indication of that, reading as broken.

## 2. Visual Design System

**Palette** (confirmed via mockup review — "Cream & Gold" direction):
- Background: warm cream/off-white (`#faf6ec`)
- Nav bar: near-black (`#1c1c1c`), gold accent text (`#c9a227` / `#e8d9a8`)
- Body text: dark charcoal (`#2a2a2a`)
- Accent/CTA: gold (`#c9a227`), with a black-text-on-gold primary button style
- Borders/dividers: soft gold-tinted grey (`#e6ddc0`)

**Typography:** Georgia (or a similar serif) for headings and the GOLVIA
wordmark; a clean sans-serif (system font stack) for body text, tables, and
form inputs — matches the mockup's split between "branded" and "readable
for data entry."

**Implementation approach:** a single shared stylesheet (`theme.css`,
imported once in `main.jsx` or `App.jsx`) defining CSS custom properties
for the palette plus reusable classes: `.btn` / `.btn-primary`, `.card`,
`.table`, `.nav`, `.input`, `.badge`, `.page` (max-width content wrapper).
Every existing page (`Login`, `Checkout`, `Dashboard`, `Products`,
`ProductForm`, `Customers`, `CustomerProfile`, `Invoices`, `InvoiceReceipt`,
`Marketing`, `Settings`) is updated to use these shared classes instead of
bare unstyled HTML elements. This is a styling pass — no layout
restructuring, no new pages, no behavior changes to any page not
separately called out below.

## 3. Inline Customer Creation at Checkout

- Next to the existing phone-number lookup field, a "+ New customer" toggle
  reveals a small inline form: name (required), phone (required), email
  (optional), WhatsApp consent checkbox (optional, default unchecked).
- Submitting calls the existing `POST /api/customers` endpoint (no server
  changes needed — it already supports all these fields and already
  auto-creates the membership account).
- On success, the newly created customer is immediately set as the active
  `customer` for the in-progress sale (same as if they'd been found via
  lookup), and the inline form collapses.
- Duplicate-phone (409) and other errors are shown inline, matching the
  existing error-handling pattern already used elsewhere on the checkout
  screen.

## 4. Receipt Redesign

Rebuild `InvoiceReceipt.jsx`'s printable section to match the approved
"Minimal & Elegant" mockup:
- Centered GOLVIA wordmark, company address below it, then a gold divider.
- Invoice number / date / customer name as a compact metadata block.
- Itemized list (product name + variant label, quantity, line amount) —
  already using real `product_name`/`variant_label` from a prior fix.
- Totals block: subtotal, discount, coins redeemed (if any), a bold total.
- A gold-tinted "coins earned this visit" box, including current tier
  (White/Silver/Gold/Platinum) as a small badge — this data
  (`coins_earned`, `coins_redeemed`, customer tier) already exists in the
  invoice/customer API responses; the receipt just isn't displaying it yet.
- A short "Thank you for shopping with GOLVIA" footer.
- No SST line (unchanged from current behavior — still not required per
  the original spec).

**Print sizing fix (bundled in, since it's the same file):** the earlier
whole-branch review found the receipt's on-screen container (148mm) is
wider than A5's actual printable area after margins (~128mm), which can
push content onto a blank second page. Tighten the printable container's
width to fit within the `@page` margins already defined.

Product images are explicitly **not** included on the receipt (per user
choice) — keeps printing fast and the paper receipt uncluttered.

## 5. Product Images

- **Import:** `importStock.js` starts capturing each row's `main_image`
  URL into `products.image_url` (column already exists, unused until now).
- **Backfill:** since the current database was already imported without
  images, a one-time script matches existing `products` rows by `name`
  against the spreadsheet and fills in `image_url` — no re-import, no risk
  to existing product/variant IDs or any invoice history.
- **Display:**
  - Products list (`Products.jsx`): a small thumbnail per row.
  - Product edit page (`ProductForm.jsx`): a larger preview image.
  - Checkout search results (`Checkout.jsx`): a small thumbnail next to
    each matching product/variant, to help staff visually confirm the
    right item among 18 similar-looking products.
- Images are loaded directly from the spreadsheet's original web link (no
  local download/hosting) — simplest approach; a broken/missing image
  just shows the browser's default broken-image placeholder, no crash.

## 6. Marketing Tab Clarity

`Marketing.jsx` is functionally correct — it only ever lists customers with
a birthday *today* or a voucher issued *today* — but shows a bare empty
list with no explanation when there's nothing pending, which reads as
broken. Add a persistent subtitle explaining the tab's scope, and an
explicit "No marketing actions pending today" message when the list is
empty. Restyled to match the new theme like every other page.

## 7. Out of Scope

- No change to receipt content beyond what's listed in §4 (no QR codes, no
  itemized images).
- No local image hosting/caching — a future concern only if the
  spreadsheet's CDN links ever go stale.
- No changes to any business logic, money calculations, or API contracts
  — this is a UI/display-layer pass plus the one inline-customer-creation
  feature, which reuses an existing endpoint.
