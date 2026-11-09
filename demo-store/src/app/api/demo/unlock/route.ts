import { NextResponse } from 'next/server';
import { PANEL_COOKIE } from '@/lib/store/panel-auth';

// A relative Location, never one built from `req.url`: behind the host nginx
// the server only sees its own listen address, so `new URL(path, req.url)`
// sent every visitor of demo.selwise.com to https://localhost:3003.
function backToPanel(error?: boolean) {
  return new NextResponse(null, { status: 303, headers: { Location: error ? '/demo-panel?error=1' : '/demo-panel' } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const key = String(form.get('key') || '');
  if (!process.env.DEMO_PANEL_KEY || key !== process.env.DEMO_PANEL_KEY) return backToPanel(true);
  const res = backToPanel();
  res.cookies.set(PANEL_COOKIE, key, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90, secure: process.env.NODE_ENV === 'production' });
  return res;
}
