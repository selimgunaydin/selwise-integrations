import { NextResponse } from 'next/server';
import { sessionSnapshot } from '@/lib/store/session';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(sessionSnapshot());
}
