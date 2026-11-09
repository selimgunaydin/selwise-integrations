import { NextResponse } from 'next/server';
import { z } from 'zod';
import { panelAllowed } from '@/lib/store/panel-auth';
import { selwiseConfig } from '@/lib/selwise/config';
import { sendBusinessEvent } from '@/lib/selwise/server';

const Body = z.object({
  key: z.string().min(2).max(64),
  siteUserId: z.string().max(64).optional(),
  visitorId: z.string().max(80).optional(),
  payload: z.record(z.unknown()).optional(),
  testMode: z.boolean().optional(),
});

/**
 * A business event, the way a merchant's own back office sends one
 * (server-to-server, with an API key): "order shipped", "loyalty tier
 * changed"… Scenarios can start from it (`on_business_event`).
 */
export async function POST(req: Request) {
  if (!panelAllowed()) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  if (!selwiseConfig().siteKey || !process.env.SELWISE_SERVER_API_KEY) {
    return NextResponse.json({ error: 'SELWISE_SITE_KEY ve SELWISE_SERVER_API_KEY tanımlı değil.' }, { status: 501 });
  }
  const r = await sendBusinessEvent(parsed.data);
  return NextResponse.json({ status: r.status, body: r.body }, { status: r.status >= 200 && r.status < 300 ? 200 : 502 });
}
