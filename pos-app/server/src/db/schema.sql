CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  brand TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_label TEXT,
  sku TEXT UNIQUE,
  cost_price REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  state TEXT,
  gender TEXT,
  birthday TEXT,
  notes TEXT,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS membership_accounts (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id),
  lifetime_coins INTEGER NOT NULL DEFAULT 0,
  current_coin_balance INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'White',
  tier_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL,
  value REAL NOT NULL,
  min_spend REAL NOT NULL DEFAULT 0,
  issued_at TEXT NOT NULL,
  expires_at TEXT,
  redeemed_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subtotal REAL NOT NULL,
  discount_total REAL NOT NULL DEFAULT 0,
  coins_redeemed INTEGER NOT NULL DEFAULT 0,
  coins_earned INTEGER NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  item_discount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  refund_amount REAL NOT NULL,
  coins_reversed INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refund_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_id INTEGER NOT NULL REFERENCES refunds(id),
  invoice_item_id INTEGER NOT NULL REFERENCES invoice_items(id),
  quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
