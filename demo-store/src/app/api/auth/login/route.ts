import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, findUserByEmail, publicUser, verifyPassword, getUser } from '@/lib/store/auth';
import { attachCartToUser, ensureCartId } from '@/lib/store/cart';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'E-posta ve şifrenizi kontrol edin.' }, { status: 400 });
  const row = findUserByEmail(parsed.data.email);
  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    return NextResponse.json({ error: 'E-posta adresi veya şifre hatalı.' }, { status: 401 });
  }
  createSession(row.id);
  const user = getUser(row.id)!;
  attachCartToUser(ensureCartId(user), user);
  return NextResponse.json({ user: publicUser(user) });
}
