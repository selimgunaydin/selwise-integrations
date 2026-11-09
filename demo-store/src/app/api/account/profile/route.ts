import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser, getUser, publicUser } from '@/lib/store/auth';
import { db } from '@/lib/store/db';
import { GENDERS, normalizePhone } from '@/lib/account/shared';

export const dynamic = 'force-dynamic';

function isPastDate(v: string) {
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
  return age >= 13 && age <= 110;
}

const Body = z.object({
  firstName: z.string().trim().min(2).max(40),
  lastName: z.string().trim().min(2).max(40),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || normalizePhone(v) !== null),
  // ISO yyyy-mm-dd: Selwise's date-based scenarios read the `birthday` trait in this shape.
  birthday: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && isPastDate(v))),
  gender: z.enum([...GENDERS, '']),
});

const FIELD_ERRORS: Record<string, string> = {
  firstName: 'Ad en az 2 karakter olmalı.',
  lastName: 'Soyad en az 2 karakter olmalı.',
  phone: 'Telefon numarasını 05xx xxx xx xx biçiminde girin.',
  birthday: 'Geçerli bir doğum tarihi girin (13 yaşından büyük olmalısınız).',
  gender: 'Geçerli bir seçim yapın.',
};

export async function PUT(req: Request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '');
    return NextResponse.json({ error: FIELD_ERRORS[field] || 'Lütfen bilgilerinizi kontrol edin.', field }, { status: 400 });
  }
  const d = parsed.data;
  const phone = d.phone ? normalizePhone(d.phone) : null;
  // Without a phone there is nothing to send an SMS to, so the permission goes with it.
  db()
    .prepare(
      `UPDATE users SET first_name = ?, last_name = ?, phone = ?, birthday = ?, gender = ?,
         sms_opt_in = CASE WHEN ? IS NULL THEN 0 ELSE sms_opt_in END WHERE id = ?`,
    )
    .run(d.firstName, d.lastName, phone, d.birthday || null, d.gender || null, phone, user.id);
  return NextResponse.json({ user: publicUser(getUser(user.id)) });
}
