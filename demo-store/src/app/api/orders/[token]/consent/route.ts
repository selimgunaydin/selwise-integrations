import { NextResponse } from 'next/server';
import { db } from '@/lib/store/db';

export function GET(_req: Request, { params }: { params: { token: string } }) {
  const row = db().prepare('SELECT marketing_email, marketing_sms FROM orders WHERE token = ?').get(params.token) as
    | { marketing_email: number; marketing_sms: number }
    | undefined;
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ email: !!row.marketing_email, sms: !!row.marketing_sms });
}
