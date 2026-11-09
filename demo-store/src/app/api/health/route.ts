import { NextResponse } from 'next/server';
import { db } from '@/lib/store/db';

export const dynamic = 'force-dynamic';

export function GET() {
  db().prepare('SELECT 1').get();
  return NextResponse.json({ ok: true });
}
