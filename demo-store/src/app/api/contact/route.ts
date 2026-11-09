import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, nowIso } from '@/lib/store/db';
import { CONTACT_SUBJECTS } from '@/lib/content/contact';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  subject: z.enum(CONTACT_SUBJECTS),
  orderNumber: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9-]*$/)
    .optional(),
  message: z.string().trim().min(10).max(2000),
});

const FIELD_ERRORS: Record<string, string> = {
  name: 'Adınızı ve soyadınızı girin.',
  email: 'Geçerli bir e-posta adresi girin.',
  subject: 'Bir konu seçin.',
  orderNumber: 'Sipariş numarası yalnızca harf ve rakam içerebilir.',
  message: 'Mesajınız en az 10 karakter olmalı.',
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '');
    return NextResponse.json({ error: FIELD_ERRORS[field] || 'Lütfen formu kontrol edin.', field }, { status: 400 });
  }
  const d = parsed.data;
  const info = db()
    .prepare('INSERT INTO contact_messages (name, email, subject, message, order_number, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(d.name, d.email.toLowerCase(), d.subject, d.message, d.orderNumber ? d.orderNumber.toUpperCase() : null, nowIso());
  // A ticket-looking reference so the confirmation has something to quote.
  return NextResponse.json({ ok: true, reference: `ARD-T${String(info.lastInsertRowid).padStart(6, '0')}` });
}
