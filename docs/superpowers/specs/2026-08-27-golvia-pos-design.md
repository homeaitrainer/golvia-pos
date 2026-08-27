# GOLVIA POS / CRM / Membership System — Design Spec

Date: 2026-08-27
Status: Approved by user, ready for implementation planning

## 1. Overview & Goals

GOLVIA operates a single jewellery retail branch with one POS counter and one
Admin staff role. This system replaces manual/ad-hoc sales tracking with a
single local application that handles:

- Retail checkout with invoice/receipt generation
- Product & inventory management (imported from existing stock list)
- Customer CRM
- A 4-tier coin-based membership & rewards program
- WhatsApp (click-to-chat) and email marketing triggered from customer records

Priorities: **easy to use** (minimal training for one Admin operator),
**easy to access** (one-click launch, no cloud dependency for daily
operation), and **complete** (every function in the requirements doc is
covered).

### Out of scope for this version
- Multi-branch / multi-counter support
- Cashier role separate from Admin
- Exchanges, deposits/down payments, repairs, gold trade-in, quotations
- Data migration (no existing customer/sales/coins history to import)
- Full WhatsApp Business API automation (deferred — see §6)
- SST on invoices (confirmed not required)

## 2. Architecture

- **Local web app**: a Node.js server runs on the shop's POS computer,
  serving a React single-page UI accessed via browser at
  `http://localhost:<port>`.
- **Database**: SQLite, a single file on disk. Chosen for zero-admin setup
  and trivial backup (copy the file).
- **Launcher**: a single script/shortcut starts the server and opens the
  browser automatically — no command-line use required day to day.
- **Connectivity**: the app works fully offline for sales, inventory, and
  CRM. Internet is only needed when sending WhatsApp click-to-chat links
  (opens WhatsApp) or system-triggered emails (Gmail SMTP).
- **Printing**: receipts/invoices render as an on-screen A5-formatted
  document and print via the browser's native print dialog to the shop's
  HP SmartTank 580 (regular inkjet — no ESC/POS thermal printing needed).

## 3. Data Model (high level)

- **Product**: id, name, category, description, brand, image
- **ProductVariant**: id, product_id, variant_label (e.g. weight "40g"),
  SKU code, cost_price, sell_price, quantity_on_hand, low_stock_threshold
- **Customer**: id, name, phone (unique, primary lookup), email, state,
  gender, birthday, notes (free text), whatsapp_consent (bool),
  created_at
- **MembershipAccount**: customer_id, lifetime_coins, current_coin_balance,
  tier (derived from lifetime_coins), tier_updated_at
- **Voucher**: id, customer_id, type (birthday/monthly-tier/promo), value,
  min_spend, issued_at, expires_at, redeemed_at (nullable)
- **Invoice**: id, invoice_number (INV-YYYY-#### sequential, resets yearly),
  customer_id (nullable = guest sale), items (line items with variant,
  qty, unit price, discount), payment_method, subtotal, discount_total,
  coins_redeemed, coins_earned, total, created_at, status
  (completed/refunded/partially-refunded)
- **Refund**: id, invoice_id, items returned, quantity, refund_amount,
  coins_reversed, payment_method, created_at
- **AdminUser**: username, password_hash
- **MessageLog**: customer_id, channel (whatsapp/email), trigger_type,
  sent_at (for click-to-chat: "opened" timestamp, not delivery-confirmed)

## 4. Product Catalog & Inventory

- Existing TikTok Shop export (`Golvia Stocks List.xlsx`, 113 rows) is
  imported and transformed: rows sharing the same `product_name` become one
  Product with multiple ProductVariants (one per `variation_value`/weight).
  Each variant keeps its own cost, price, quantity, and SKU
  (`seller_sku`).
- Product selection at checkout supports both **manual search** (by name,
  category, or SKU code, with thumbnail images for quick visual ID) and
  **barcode scanning**: a dedicated, always-focused scan-input field
  accepts input from any HID keyboard-emulation barcode scanner (USB
  wired, USB wireless dongle, or Bluetooth) — the scanner "types" the
  SKU code and presses Enter, the system looks up the matching variant
  and adds it to the cart. No driver or special integration needed; any
  scanner in HID mode works, including 2D/1D/QR wireless models. (A USB
  wireless dongle is recommended over direct Bluetooth-to-Windows pairing
  for reliability, if the scanner supports both.)
- Stock quantity auto-decrements on sale, auto-increments on refund/return.
- Admin can manually adjust stock (restock, correction) with a required
  reason note, logged for audit.
- Low-stock badge shown in catalog view when quantity falls below a
  per-product configurable threshold.
- Only the logged-in Admin can create/edit/delete products or change
  prices.

## 5. POS Sales / Checkout / Invoicing

**Checkout flow:**
1. Search/select products (manually or via barcode scan — see §4) → add
   to cart with variant, quantity, unit price.
2. Attach a customer by phone number lookup (primary key), create new
   customer inline, or proceed as guest (no CRM/coin activity for guest
   sales).
3. Apply discounts as needed:
   - **Per-item discount**: RM amount or % keyed in on an individual cart
     line.
   - **Lump-sum discount**: RM amount or % applied across the whole cart
     total.
   - Both types can be used together on the same sale (per-item discounts
     applied first, then the lump-sum discount applied to the resulting
     subtotal).
4. If a member is attached: available coin balance and any valid/eligible
   vouchers are shown and can be applied as further discounts, capped at
   the remaining cart total.
5. Select payment method: Cash, DuitNow/QR, Bank Transfer, or E-wallet
   (one method per sale).
6. Complete sale → system assigns the next sequential invoice number in
   the format `INV-2026-0001` (year-scoped, resets each new year).
7. Receipt renders as an A5 document (company name, address, invoice
   number, date, customer info if attached, itemized products with any
   discounts shown, totals, payment method — no SST line) and opens the
   browser print dialog.
8. Coins earned = floor(pre-discount original price / 3), credited
   immediately; the customer's tier is re-evaluated against updated
   lifetime coins (lifetime coins never decrease from redemption).

**Returns / Refunds:**
- Admin looks up a past invoice, selects item(s)/quantity to return.
- System restocks the returned quantity, reverses the proportional coins
  originally earned on those items, and records a Refund linked to the
  original Invoice with its own payment method and amount.
- Invoice status updates to refunded/partially-refunded.

**Sales history**: all invoices searchable by invoice number, date range,
or customer; any invoice can be reviewed and reprinted.

## 6. Customer CRM

- Fields: name, phone (unique, primary lookup), email, state, gender,
  birthday, free-text notes (favourite designs, anniversary, ring size,
  repair history, etc.).
- `whatsapp_consent` is an explicit opt-in toggle, editable at any time,
  and gates whether any marketing action is available for that customer.
- Customer profile shows full purchase history, lifetime spend, current
  coin balance, and tier at a glance.
- Search by phone (primary), name, or email.

## 7. Membership & Rewards

**Tiers** (based on lifetime coins earned; a tier never downgrades from
spending or redeeming coins):
| Tier | Lifetime coins |
|---|---|
| White | 0 – 3,000 |
| Silver | 3,001 – 5,000 |
| Gold | 5,001 – 12,000 |
| Platinum | 12,001+ |

**Coins:**
- Earning rate: RM3 spent = 1 coin, calculated on the pre-discount
  original price.
- Redemption: 100 coins = RM1 discount value, applied at checkout, capped
  at cart total. Redeeming reduces `current_coin_balance` only —
  `lifetime_coins` (which drives tier) is untouched.
- No expiry on coins.
- A refund reverses the coins that were earned on the returned items
  (reduces both current balance and lifetime total for that portion).

**Birthday reward:** RM10 voucher, auto-generated on the member's
registered birthday, valid only that calendar day (auto-expires the next
day), no minimum spend, once per year per member.

**Monthly tier vouchers:** issued automatically once a member has
visited/spent at least RM30 on 7 separate days within the month (derived
from invoice history — no separate check-in UI needed). Vouchers per tier:

| Tier | Vouchers unlocked |
|---|---|
| White | RM3 (min spend RM50) |
| Silver | + RM5 (min spend RM100) |
| Gold | + RM8 (min spend RM150) |
| Platinum | + RM10 (min spend RM200) |

**Member discount:** applies to all products at checkout, no exclusions.

## 8. Marketing — WhatsApp & Email

- **WhatsApp (click-to-chat)**: from a consented customer's profile or a
  "Marketing" list view (e.g. today's birthdays, newly issued vouchers,
  tier upgrades), staff trigger a prepared message; the system opens a
  `wa.me` deep link pre-filled with the message text, and staff taps send
  inside WhatsApp. No WhatsApp Business API account required for this
  version. Every message template is written so that swapping in a real
  API provider later (Meta Cloud API, Twilio, 360dialog) requires no
  change to triggers or customer opt-in logic — only the sending
  mechanism changes.
- **Email**: sent automatically (no manual step) via a GOLVIA business
  Gmail account (address + app password configured in system settings)
  for: receipt copy on request, birthday reward notice, tier-upgrade
  notice, monthly voucher issued.
- **Templates**: editable per trigger type (birthday, tier upgrade,
  voucher issued, promotion) from system settings, no code changes
  needed to update wording.
- Consent (`whatsapp_consent`) gates all WhatsApp actions; customers who
  haven't opted in are excluded from marketing lists entirely.

## 9. Admin, Security & Backup

- Single Admin account (username + password login), session persists
  until logout or computer restart.
- Automatic local backup: the SQLite file is copied to a `backups/`
  folder daily, keeping a rolling window (e.g. last 30 days).
- Manual "Export all data" button producing Excel/CSV files (sales,
  customers, products) for the user to copy elsewhere (USB, Google
  Drive) themselves.
- Simple dashboard: today's sales total and transaction count, low-stock
  alerts, upcoming birthdays.

## 10. Branding

- GOLVIA gold transparent logo used on the receipt/invoice header and
  in the app UI. Logo file to be provided by the user; a placeholder is
  used until then.
- Company details on invoice: GOLVIA, 16, Jalan SC 1, Pusat Perindustrian
  Sungai Chua, 43200 Kajang, Selangor, Malaysia. No phone number or SST
  registration number on invoice.

## 11. Resolved ambiguities from the source requirements doc

The original requirements doc contained a few internal contradictions,
resolved during design review with the user:

- **SST**: not displayed on invoices/receipts at all (the later, more
  detailed section of the doc overrides an earlier generic answer).
- **Quotations**: not included — only completed walk-in sales.
- **Daily check-in**: not a standalone feature; it describes the
  eligibility condition for monthly tier vouchers (7 days/week with
  RM30+ spend), not a separate reward.

## 12. Tech Stack

Node.js + Express (server) + React (UI) + SQLite (database). Chosen for
fast local setup, a single-file database that's trivial to back up, and
a modern responsive UI reusable for the print-friendly A5 invoice layout.
