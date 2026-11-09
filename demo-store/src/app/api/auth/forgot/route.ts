import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createPasswordReset, findUserByEmail } from '@/lib/store/auth';

const Body = z.object({ email: z.string().email() });

/**
 * The demo store sends no e-mail of its own (that is Selwise's job, through the
 * merchant's provider). So the reset link is returned to the page and shown
 * there — clearly labelled as a demo shortcut.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçerli bir e-posta adresi girin.' }, { status: 400 });
  const user = findUserByEmail(parsed.data.email);
  if (!user) return NextResponse.json({ ok: true, link: null });
  const token = createPasswordReset(user.id);
  return NextResponse.json({ ok: true, link: `/reset-password/${token}` });
}
