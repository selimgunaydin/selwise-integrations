import { NextResponse } from 'next/server';
import { z } from 'zod';
import { panelAllowed } from '@/lib/store/panel-auth';
import { db, nowIso } from '@/lib/store/db';

const Body = z.object({
  code: z.string().regex(/^[A-Z0-9_-]{3,32}$/),
  kind: z.enum(['percent', 'amount', 'shipping']),
  value: z.number().min(0),
  minTotal: z.number().min(0).default(0),
  description: z.string().min(2).max(120),
  active: z.boolean().default(true),
});

export async function POST(req: Request) {
  if (!panelAllowed()) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Kod büyük harf/rakam olmalı (3-32 karakter).' }, { status: 400 });
  const c = parsed.data;
  db()
    .prepare(
      `INSERT INTO coupons (code, kind, value, min_total, description, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET kind = excluded.kind, value = excluded.value, min_total = excluded.min_total, description = excluded.description, active = excluded.active`,
    )
    .run(c.code, c.kind, c.value, c.minTotal, c.description, c.active ? 1 : 0, nowIso());
  return NextResponse.json({ ok: true });
}
