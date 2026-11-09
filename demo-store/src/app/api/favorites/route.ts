import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/store/auth';
import { db, nowIso } from '@/lib/store/db';
import { getByCode } from '@/lib/catalog';

const Body = z.object({ code: z.string(), action: z.enum(['add', 'remove']) });

export async function POST(req: Request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !getByCode(parsed.data.code)) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  if (parsed.data.action === 'add') {
    db().prepare('INSERT OR IGNORE INTO favorites (user_id, code, created_at) VALUES (?, ?, ?)').run(user.id, parsed.data.code, nowIso());
  } else {
    db().prepare('DELETE FROM favorites WHERE user_id = ? AND code = ?').run(user.id, parsed.data.code);
  }
  return NextResponse.json({ ok: true });
}
