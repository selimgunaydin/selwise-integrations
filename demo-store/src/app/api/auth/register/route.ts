import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, createUser, findUserByEmail, publicUser } from '@/lib/store/auth';
import { attachCartToUser, ensureCartId } from '@/lib/store/cart';
import { normalizePhone } from '@/lib/account/shared';

const Body = z.object({
  firstName: z.string().trim().min(2).max(40),
  lastName: z.string().trim().min(2).max(40),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().regex(/^\+?[0-9 ]{10,16}$/).optional().or(z.literal('')),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  gender: z.enum(['Kadın', 'Erkek', '']).optional(),
  emailOptIn: z.boolean().default(false),
  smsOptIn: z.boolean().default(false),
  terms: z.literal(true),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const msg =
      field === 'password'
        ? 'Şifreniz en az 8 karakter olmalı.'
        : field === 'terms'
          ? 'Üyelik sözleşmesini onaylamalısınız.'
          : field === 'phone'
            ? 'Telefon numarasını +905xxxxxxxxx biçiminde girin.'
            : 'Lütfen bilgilerinizi kontrol edin.';
    return NextResponse.json({ error: msg, field }, { status: 400 });
  }
  const d = parsed.data;
  if (findUserByEmail(d.email)) return NextResponse.json({ error: 'Bu e-posta adresiyle zaten bir üyelik var.', field: 'email' }, { status: 409 });
  const phone = d.phone ? normalizePhone(d.phone) : null;
  if (d.phone && !phone) return NextResponse.json({ error: 'Telefon numarasını +905xxxxxxxxx biçiminde girin.', field: 'phone' }, { status: 400 });
  const user = createUser({
    email: d.email,
    password: d.password,
    firstName: d.firstName,
    lastName: d.lastName,
    phone: phone || undefined,
    birthday: d.birthday || undefined,
    gender: d.gender || undefined,
    emailOptIn: d.emailOptIn,
    smsOptIn: d.smsOptIn,
  });
  createSession(user.id);
  attachCartToUser(ensureCartId(user), user);
  return NextResponse.json({ user: publicUser(user) });
}
