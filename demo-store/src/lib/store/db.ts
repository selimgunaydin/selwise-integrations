/**
 * The demo store's own database.
 *
 * SQLite in a single file (`DEMO_STORE_DATA_DIR`, a docker volume in
 * production). The store is a stand-in for a merchant's commerce backend:
 * accounts, baskets and orders live HERE, and Selwise only ever hears about
 * them the way it would from a real storefront — through the widget, the data
 * layer and `trackOrder`. Nothing in this file talks to Selwise.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  birthday TEXT,
  gender TEXT,
  email_opt_in INTEGER NOT NULL DEFAULT 0,
  sms_opt_in INTEGER NOT NULL DEFAULT 0,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  line TEXT NOT NULL,
  postcode TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  coupon_code TEXT,
  gift_wrap INTEGER NOT NULL DEFAULT 0,
  gift_note TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cart_items (
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  size TEXT NOT NULL,
  qty INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (cart_id, code, size)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount_total REAL NOT NULL,
  shipping_total REAL NOT NULL,
  payment_fee REAL NOT NULL DEFAULT 0,
  gift_wrap_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  coupon_code TEXT,
  shipping_method TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  shipping_address TEXT NOT NULL,
  billing_address TEXT NOT NULL,
  items TEXT NOT NULL,
  marketing_email INTEGER NOT NULL DEFAULT 0,
  marketing_sms INTEGER NOT NULL DEFAULT 0,
  gift_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at);
CREATE TABLE IF NOT EXISTS order_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  items TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, code)
);
CREATE TABLE IF NOT EXISTS stock_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  size TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (email, code, size)
);
CREATE TABLE IF NOT EXISTS overrides (
  code TEXT PRIMARY KEY,
  price REAL,
  list_price REAL,
  stock TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value REAL NOT NULL,
  min_total REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  order_number TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT,
  signature_ok INTEGER,
  headers TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_status_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  event_key TEXT,
  event_result TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_status_log_order ON order_status_log(order_id, id);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_code TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  rating INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const DEFAULT_COUPONS: Array<[string, string, number, number, string]> = [
  ['HOSGELDIN10', 'percent', 10, 0, 'İlk siparişe özel %10 indirim'],
  ['ARDISA15', 'percent', 15, 1000, '1.000 TL ve üzeri alışverişte %15 indirim'],
  ['SEPET200', 'amount', 200, 1500, '1.500 TL ve üzeri alışverişte 200 TL indirim'],
  ['KARGOBEDAVA', 'shipping', 0, 0, 'Kargo ücretsiz'],
  ['GERIDON20', 'percent', 20, 0, 'Sepetini tamamla, %20 indirim kazan'],
];

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;
  const dir = process.env.DEMO_STORE_DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const conn = new Database(path.join(dir, 'ardisa.db'));
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(SCHEMA);
  // A volume created before these columns existed keeps its orders; SQLite has
  // no ADD COLUMN IF NOT EXISTS, so ask first.
  const orderColumns = (conn.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!orderColumns.includes('visitor_id')) conn.exec('ALTER TABLE orders ADD COLUMN visitor_id TEXT');
  if (!orderColumns.includes('tracking_no')) conn.exec('ALTER TABLE orders ADD COLUMN tracking_no TEXT');
  const now = new Date().toISOString();
  const insert = conn.prepare(
    'INSERT OR IGNORE INTO coupons (code, kind, value, min_total, description, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
  );
  for (const c of DEFAULT_COUPONS) insert.run(...c, now);
  instance = conn;
  return conn;
}

export const nowIso = () => new Date().toISOString();
