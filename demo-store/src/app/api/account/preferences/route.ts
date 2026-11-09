import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser, getUser, publicUser } from '@/lib/store/auth';
import { db } from '@/lib/store/db';

export const dynamic = 'force-dynamic';

const Body = z
  .object({ emailOptIn: z.boolean().optional(), smsOptIn: z.boolean().optional() })
  .refine((b) => b.emailOptIn !== undefined || b.smsOptIn !== undefined);

export async function PUT(req: Request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  const { emailOptIn, smsOptIn } = parsed.data;
  if (smsOptIn && !user.phone) {
    return NextResponse.json({ error: 'SMS izni için önce Kullanıcı Bilgilerim sayfasından telefon numaranızı ekleyin.' }, { status: 400 });
  }
  db()
    .prepare('UPDATE users SET email_opt_in = ?, sms_opt_in = ? WHERE id = ?')
    .run(
      emailOptIn === undefined ? user.email_opt_in : emailOptIn ? 1 : 0,
      smsOptIn === undefined ? user.sms_opt_in : smsOptIn ? 1 : 0,
      user.id,
    );
  return NextResponse.json({ user: publicUser(getUser(user.id)) });
}
