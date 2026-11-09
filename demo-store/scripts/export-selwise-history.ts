/**
 * Export the store's users and orders as Selwise import files.
 *
 *   npx tsx scripts/export-selwise-history.ts [outDir]
 *
 * Reads the store's SQLite file (DEMO_STORE_DATA_DIR, default ./data) and
 * writes `users.ndjson` and `orders.ndjson` into outDir (default
 * ./export). Upload them under Settings → Data Import in the Selwise panel:
 * users first, then orders, validate, apply.
 *
 * A command-line tool on purpose: the files hold e-mail addresses and phone
 * numbers, so there is no HTTP route that serves them. Streams row by row —
 * a real store's export must not hold the whole history in memory either.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { toImportOrder, toImportUser, type StoreOrderRow, type StoreUserRow } from '../src/lib/selwise/history-export';

const dataDir = process.env.DEMO_STORE_DATA_DIR || path.join(process.cwd(), 'data');
const outDir = path.resolve(process.argv[2] || 'export');
const dbFile = path.join(dataDir, 'ardisa.db');

if (!fs.existsSync(dbFile)) {
  console.error(`Veritabanı yok: ${dbFile} (DEMO_STORE_DATA_DIR?)`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const db = new Database(dbFile, { readonly: true });

function write(file: string, rows: Iterable<unknown>) {
  const target = path.join(outDir, file);
  const fd = fs.openSync(target, 'w');
  let n = 0;
  for (const row of rows) {
    fs.writeSync(fd, `${JSON.stringify(row)}\n`);
    n += 1;
  }
  fs.closeSync(fd);
  console.log(`${file}: ${n} satır → ${target}`);
}

const users = db
  .prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.birthday, u.gender, u.email_opt_in, u.sms_opt_in,
            u.loyalty_points, u.created_at, (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id) AS last_order_at
       FROM users u ORDER BY u.id`,
  )
  .iterate() as IterableIterator<StoreUserRow>;
write('users.ndjson', (function* () {
  for (const u of users) yield toImportUser(u);
})());

const orders = db
  .prepare(
    `SELECT number, user_id, email, status, subtotal, discount_total, shipping_total, total, coupon_code,
            shipping_method, payment_method, items, created_at
       FROM orders ORDER BY created_at`,
  )
  .iterate() as IterableIterator<StoreOrderRow>;
write('orders.ndjson', (function* () {
  for (const o of orders) yield toImportOrder(o);
})());

db.close();
