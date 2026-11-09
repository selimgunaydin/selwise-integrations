import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, nowIso } from '@/lib/store/db';
import { getByCode } from '@/lib/catalog';

const Body = z.object({ email: z.string().email(), code: z.string(), size: z.string().nullable().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !getByCode(parsed.data.code)) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  db()
    .prepare('INSERT OR IGNORE INTO stock_alerts (email, code, size, created_at) VALUES (?, ?, ?, ?)')
    .run(parsed.data.email.toLowerCase(), parsed.data.code, parsed.data.size || null, nowIso());
  return NextResponse.json({ ok: true });
}
