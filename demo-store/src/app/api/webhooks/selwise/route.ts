import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { db, nowIso } from '@/lib/store/db';

/**
 * The merchant's back office receiving Selwise webhooks (Entegrasyonlar →
 * Webhook'lar, and scenario "relay" steps). Every delivery is kept so the test
 * panel can show what Selwise sent; when SELWISE_WEBHOOK_SECRET is set the
 * HMAC signature is checked (hex SHA-256 of the raw body, with or without a
 * "sha256=" prefix) and recorded — a delivery is never refused, a demo wants
 * to see the bad ones too.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (/^(x-|content-type|user-agent|authorization)/i.test(k)) headers[k] = k === 'authorization' ? '[redacted]' : v.slice(0, 300);
  });
  const secret = process.env.SELWISE_WEBHOOK_SECRET;
  let signatureOk: number | null = null;
  if (secret) {
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const sent = Object.entries(headers).find(([k]) => k.includes('signature'))?.[1]?.replace(/^sha256=/, '') || '';
    signatureOk = sent && sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected)) ? 1 : 0;
  }
  let event: string | null = null;
  try {
    const body = JSON.parse(raw);
    event = body?.event || body?.type || body?.name || body?.eventName || null;
  } catch {
    /* not JSON */
  }
  db()
    .prepare('INSERT INTO webhook_deliveries (event, signature_ok, headers, body, received_at) VALUES (?, ?, ?, ?, ?)')
    .run(event, signatureOk, JSON.stringify(headers), raw.slice(0, 20000), nowIso());
  // Keep the table small: the last 500 deliveries are plenty for a demo.
  db().prepare('DELETE FROM webhook_deliveries WHERE id NOT IN (SELECT id FROM webhook_deliveries ORDER BY id DESC LIMIT 500)').run();
  return NextResponse.json({ ok: true });
}
