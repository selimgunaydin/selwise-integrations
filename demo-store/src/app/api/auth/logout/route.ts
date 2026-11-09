import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession } from '@/lib/store/auth';
import { CART_COOKIE } from '@/lib/store/cart';

export function POST() {
  destroySession();
  // The basket stays with the account; this browser starts a fresh anonymous one.
  cookies().delete(CART_COOKIE);
  return NextResponse.json({ ok: true });
}
