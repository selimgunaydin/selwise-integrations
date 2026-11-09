/**
 * Server-only helpers for the account area: the login guard, the shopper's
 * own orders and the address book.
 */
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUser, type User } from '../store/auth';
import { db, nowIso } from '../store/db';
import { getOrderById, type OrderView } from '../store/orders';
import { TR_CITIES, normalizePhone } from './shared';

/** Every account page calls this with its own path, so login sends the shopper back to it. */
export function requireUser(path: string): User {
  const user = currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  return user;
}

/** An order by number, only if it belongs to this shopper. */
export function findUserOrder(userId: number, number: string): OrderView | null {
  const row = db()
    .prepare('SELECT id FROM orders WHERE number = ? AND user_id = ?')
    .get(number.trim().toUpperCase(), userId) as { id: number } | undefined;
  return row ? getOrderById(row.id) : null;
}

export function orderCount(userId: number) {
  return (db().prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(userId) as { n: number }).n;
}

// ------------------------------------------------------------------ addresses

interface AddressRow {
  id: number;
  user_id: number;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  city: string;
  district: string;
  line: string;
  postcode: string | null;
  is_default: number;
  created_at: string;
}

export interface Address {
  id: number;
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  line: string;
  postcode: string | null;
  isDefault: boolean;
}

const toAddress = (r: AddressRow): Address => ({
  id: r.id,
  title: r.title,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone,
  city: r.city,
  district: r.district,
  line: r.line,
  postcode: r.postcode,
  isDefault: !!r.is_default,
});

export const AddressSchema = z.object({
  title: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(2).max(40),
  lastName: z.string().trim().min(2).max(40),
  phone: z.string().trim().refine((v) => normalizePhone(v) !== null),
  city: z.enum(TR_CITIES),
  district: z.string().trim().min(2).max(60),
  line: z.string().trim().min(10).max(250),
  postcode: z
    .string()
    .trim()
    .regex(/^\d{5}$/)
    .optional()
    .or(z.literal('')),
  isDefault: z.boolean().optional(),
});
export type AddressFormInput = z.infer<typeof AddressSchema>;

const FIELD_ERRORS: Record<string, string> = {
  title: 'Adres başlığı girin (ör. Ev, İş).',
  firstName: 'Ad en az 2 karakter olmalı.',
  lastName: 'Soyad en az 2 karakter olmalı.',
  phone: 'Telefon numarasını 05xx xxx xx xx biçiminde girin.',
  city: 'Listeden bir il seçin.',
  district: 'İlçe girin.',
  line: 'Açık adres en az 10 karakter olmalı.',
  postcode: 'Posta kodu 5 haneli olmalı.',
};

export function addressError(issues: z.ZodIssue[]) {
  const field = String(issues[0]?.path[0] ?? '');
  return { error: FIELD_ERRORS[field] || 'Lütfen adres bilgilerini kontrol edin.', field };
}

export function listAddresses(userId: number): Address[] {
  const rows = db()
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC')
    .all(userId) as AddressRow[];
  return rows.map(toAddress);
}

function ownAddress(userId: number, id: number) {
  return db().prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(id, userId) as AddressRow | undefined;
}

export function createAddress(userId: number, input: AddressFormInput): Address {
  const conn = db();
  const hasAny = conn.prepare('SELECT 1 FROM addresses WHERE user_id = ? LIMIT 1').get(userId);
  const makeDefault = !hasAny || !!input.isDefault;
  const tx = conn.transaction(() => {
    if (makeDefault) conn.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(userId);
    const info = conn
      .prepare(
        `INSERT INTO addresses (user_id, title, first_name, last_name, phone, city, district, line, postcode, is_default, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        input.title,
        input.firstName,
        input.lastName,
        normalizePhone(input.phone),
        input.city,
        input.district,
        input.line,
        input.postcode || null,
        makeDefault ? 1 : 0,
        nowIso(),
      );
    return Number(info.lastInsertRowid);
  });
  const id = tx();
  return toAddress(ownAddress(userId, id)!);
}

export function updateAddress(userId: number, id: number, input: AddressFormInput): Address | null {
  if (!ownAddress(userId, id)) return null;
  const conn = db();
  conn.transaction(() => {
    if (input.isDefault) conn.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(userId);
    conn
      .prepare(
        `UPDATE addresses SET title = ?, first_name = ?, last_name = ?, phone = ?, city = ?, district = ?, line = ?, postcode = ?
         ${input.isDefault ? ', is_default = 1' : ''} WHERE id = ? AND user_id = ?`,
      )
      .run(input.title, input.firstName, input.lastName, normalizePhone(input.phone), input.city, input.district, input.line, input.postcode || null, id, userId);
  })();
  return toAddress(ownAddress(userId, id)!);
}

export function deleteAddress(userId: number, id: number): boolean {
  const row = ownAddress(userId, id);
  if (!row) return false;
  const conn = db();
  conn.transaction(() => {
    conn.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(id, userId);
    // The book always has a default while it has anything in it.
    if (row.is_default) {
      const next = conn.prepare('SELECT id FROM addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId) as { id: number } | undefined;
      if (next) conn.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(next.id);
    }
  })();
  return true;
}

export function setDefaultAddress(userId: number, id: number): boolean {
  if (!ownAddress(userId, id)) return false;
  const conn = db();
  conn.transaction(() => {
    conn.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(userId);
    conn.prepare('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  })();
  return true;
}
