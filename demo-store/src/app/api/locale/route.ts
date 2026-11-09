import { NextResponse } from 'next/server';
import { LOCALE_COOKIE, STORE_LOCALES } from '@/lib/selwise/locale';

/** Sets the language <html lang> carries — what the Selwise widget reads. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { locale?: string };
  const locale = body.locale || '';
  if (!(STORE_LOCALES as readonly string[]).includes(locale)) {
    return NextResponse.json({ error: `locale: ${STORE_LOCALES.join(' | ')}` }, { status: 400 });
  }
  const res = NextResponse.json({ locale });
  res.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}
