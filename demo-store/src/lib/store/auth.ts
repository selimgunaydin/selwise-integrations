import crypto from 'crypto';
import { cookies } from 'next/headers';
import { db, nowIso } from './db';
import { signSelwiseIdentity } from '../selwise/identity';

export const SESSION_COOKIE = 'ardisa_session';
const SESSION_DAYS = 30;

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birthday: string | null;
  gender: string | null;
  email_opt_in: number;
  sms_opt_in: number;
  loyalty_points: number;
  created_at: string;
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

/** The id Selwise sees: stable, short, never the e-mail (SITE_USER_ID_MAX_LENGTH is 64). */
export const selwiseUserId = (u: Pick<User, 'id'>) => `ardisa-${u.id}`;

export function createSession(userId: number) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db().prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, nowIso(), expires.toISOString());
  cookies().set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', expires, secure: process.env.NODE_ENV === 'production' });
  return token;
}

export function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  cookies().delete(SESSION_COOKIE);
}

export function currentUser(): User | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, nowIso()) as (User & { password_hash: string }) | undefined;
  if (!row) return null;
  const { password_hash: _ignored, ...user } = row;
  return user;
}

export function findUserByEmail(email: string) {
  return db().prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as
    | (User & { password_hash: string })
    | undefined;
}

export function createUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  birthday?: string;
  gender?: string;
  emailOptIn?: boolean;
  smsOptIn?: boolean;
}): User {
  const info = db()
    .prepare(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, birthday, gender, email_opt_in, sms_opt_in, loyalty_points, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100, ?)`,
    )
    .run(
      input.email.trim().toLowerCase(),
      hashPassword(input.password),
      input.firstName.trim(),
      input.lastName.trim(),
      input.phone || null,
      input.birthday || null,
      input.gender || null,
      input.emailOptIn ? 1 : 0,
      input.smsOptIn ? 1 : 0,
      nowIso(),
    );
  return getUser(Number(info.lastInsertRowid))!;
}

export function getUser(id: number): User | null {
  const row = db().prepare('SELECT * FROM users WHERE id = ?').get(id) as (User & { password_hash: string }) | undefined;
  if (!row) return null;
  const { password_hash: _ignored, ...user } = row;
  return user;
}

export function createPasswordReset(userId: number) {
  const token = crypto.randomBytes(20).toString('hex');
  db()
    .prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, new Date(Date.now() + 3600e3).toISOString());
  return token;
}

export function consumePasswordReset(token: string, newPassword: string) {
  const row = db()
    .prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > ?')
    .get(token, nowIso()) as { user_id: number } | undefined;
  if (!row) return false;
  db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), row.user_id);
  db().prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
  db().prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  return true;
}

/** What the client is allowed to know about the shopper. */
export function publicUser(u: User | null) {
  if (!u) return null;
  const selwiseId = selwiseUserId(u);
  // The signature only — the identity secret stays on the server (lib/selwise/identity).
  const signature = signSelwiseIdentity(selwiseId);
  return {
    id: u.id,
    selwiseId,
    selwiseIdHash: signature?.userHash ?? null,
    selwiseIdHashTs: signature?.userHashTs ?? null,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    phone: u.phone,
    birthday: u.birthday,
    gender: u.gender,
    emailOptIn: !!u.email_opt_in,
    smsOptIn: !!u.sms_opt_in,
    loyaltyPoints: u.loyalty_points,
    memberSince: u.created_at,
  };
}

export type PublicUser = NonNullable<ReturnType<typeof publicUser>>;
