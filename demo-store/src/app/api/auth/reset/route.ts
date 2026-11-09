import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumePasswordReset } from '@/lib/store/auth';

const Body = z.object({ token: z.string().min(10), password: z.string().min(8).max(100) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Şifreniz en az 8 karakter olmalı.' }, { status: 400 });
  if (!consumePasswordReset(parsed.data.token, parsed.data.password)) {
    return NextResponse.json({ error: 'Bağlantının süresi dolmuş ya da daha önce kullanılmış.' }, { status: 410 });
  }
  return NextResponse.json({ ok: true });
}
