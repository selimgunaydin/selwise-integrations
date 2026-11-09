import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/store/auth';
import { db, nowIso } from '@/lib/store/db';

const Body = z.object({ groupCode: z.string(), rating: z.number().int().min(1).max(5), title: z.string().min(1).max(80), body: z.string().min(1).max(800) });

export async function POST(req: Request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  const author = `${user.first_name} ${user.last_name.charAt(0)}.`;
  const date = nowIso();
  db()
    .prepare('INSERT INTO reviews (group_code, user_id, author, rating, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(parsed.data.groupCode, user.id, author, parsed.data.rating, parsed.data.title, parsed.data.body, date);
  return NextResponse.json({ author, rating: parsed.data.rating, title: parsed.data.title, body: parsed.data.body, date });
}
