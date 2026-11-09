import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { SESSION_COOKIE, currentUser, findUserByEmail, hashPassword, verifyPassword } from '@/lib/store/auth';
import { db } from '@/lib/store/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  current: z.string().min(1).max(100),
  next: z.string().max(100),
  repeat: z.string().max(100),
});

export async function PUT(req: Request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Lütfen tüm alanları doldurun.' }, { status: 400 });
  const { current, next, repeat } = parsed.data;
  if (next.length < 8) return NextResponse.json({ error: 'Yeni şifreniz en az 8 karakter olmalı.', field: 'next' }, { status: 400 });
  if (next !== repeat) return NextResponse.json({ error: 'Yeni şifreler birbiriyle eşleşmiyor.', field: 'repeat' }, { status: 400 });
  if (next === current) return NextResponse.json({ error: 'Yeni şifreniz mevcut şifrenizle aynı olamaz.', field: 'next' }, { status: 400 });
  const stored = findUserByEmail(user.email);
  if (!stored || !verifyPassword(current, stored.password_hash)) {
    return NextResponse.json({ error: 'Mevcut şifreniz hatalı.', field: 'current' }, { status: 400 });
  }
  db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
  // Other devices are signed out; this one keeps its session.
  const token = cookies().get(SESSION_COOKIE)?.value || '';
  db().prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, token);
  return NextResponse.json({ ok: true });
}
