import { NextResponse } from 'next/server';
import { z } from 'zod';
import { panelAllowed } from '@/lib/store/panel-auth';
import { db } from '@/lib/store/db';
import { markPaid, recordEventResult, setStatus, type OrderRow, toView } from '@/lib/store/orders';
import { nextStatus, orderEventKey, STATUS_LABELS, type OrderStatus } from '@/lib/store/order-status';
import { selwiseUserId } from '@/lib/store/auth';
import { sendBusinessEvent, sendOrderStatus } from '@/lib/selwise/server';
import { formatPrice } from '@/lib/format';

const STATUSES = Object.keys(STATUS_LABELS) as [OrderStatus, ...OrderStatus[]];

const Body = z.discriminatedUnion('action', [
  z.object({ id: z.number().int(), action: z.literal('mark_paid') }),
  z.object({ id: z.number().int(), action: z.literal('advance'), notify: z.boolean().optional() }),
  z.object({ id: z.number().int(), action: z.literal('set_status'), status: z.enum(STATUSES), notify: z.boolean().optional() }),
]);

/**
 * What a merchant's back office would say about an order that changed state:
 * one business event per status, named `order_<status>` (`order_shipped`,
 * `order_delivered`…). A scenario that starts from that key runs for the
 * order's owner — the signed-in member, or the browser that placed it.
 *
 * Only scalars: the trigger context becomes message tokens (`${orderNumber}`),
 * and an object member is dropped there. No `orderId` either — a trigger
 * carrying one reads as a purchase and gets product blocks it never asked for.
 */
function eventPayload(row: OrderRow, status: OrderStatus, previous: OrderStatus) {
  const view = toView(row);
  const first = view.lines[0];
  return {
    orderNumber: view.number,
    status,
    statusLabel: STATUS_LABELS[status],
    previousStatus: previous,
    total: formatPrice(view.total),
    totalAmount: view.total,
    itemCount: view.lines.reduce((n, l) => n + l.qty, 0),
    firstItem: first ? first.title : '',
    firstName: view.shippingAddress.firstName,
    carrier: 'Ardisa Kargo',
    trackingNo: view.trackingNo ?? '',
    trackingUrl: `${process.env.DEMO_STORE_PUBLIC_URL || 'http://localhost:3003'}/siparis-takip`,
  };
}

async function notifySelwise(orderId: number, previous: OrderStatus, status: OrderStatus, logId: number) {
  const row = db().prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow;
  const key = orderEventKey(status);
  const user = row.user_id ? (db().prepare('SELECT id FROM users WHERE id = ?').get(row.user_id) as { id: number } | undefined) : undefined;
  const siteUserId = user ? selwiseUserId(user) : undefined;
  const visitorId = row.visitor_id || undefined;
  if (!siteUserId && !visitorId) {
    const note = 'Sipariş sahibi bilinmiyor (misafir ve ziyaretçi kimliği kayıtlı değil): olay gönderilmedi.';
    recordEventResult(logId, key, note);
    return { key, sent: false, accepted: false, scenarios: 0, note };
  }
  const r = await sendBusinessEvent({ key, siteUserId, visitorId, payload: eventPayload(row, status, previous) });
  let note: string;
  if (r.status === 0) note = r.body;
  else if (!r.accepted) note = `Selwise olayı kabul etmedi (HTTP ${r.status}): ${r.body.slice(0, 120)}`;
  else if (r.scenarios === 0) note = `Selwise aldı ama "${key}" olayını bekleyen yayında senaryo yok.`;
  else note = `${r.scenarios} senaryo başlatıldı.`;
  recordEventResult(logId, key, note);
  return { key, sent: true, accepted: r.accepted, scenarios: r.scenarios, note };
}

export async function POST(req: Request) {
  if (!panelAllowed()) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  const d = parsed.data;

  if (d.action === 'mark_paid') {
    const paid = markPaid(d.id);
    if (paid) await sendOrderStatus(paid, 'received');
    return NextResponse.json({ ok: true });
  }

  try {
    const row = db().prepare('SELECT * FROM orders WHERE id = ?').get(d.id) as OrderRow | undefined;
    if (!row) return NextResponse.json({ error: 'Sipariş bulunamadı.' }, { status: 404 });
    const current = toView(row).status;
    const to = d.action === 'advance' ? nextStatus(current) : d.status;
    if (!to) return NextResponse.json({ error: `"${STATUS_LABELS[current]}" son aşama; ilerletilecek bir adım yok.` }, { status: 422 });
    if (to === current) return NextResponse.json({ error: `Sipariş zaten "${STATUS_LABELS[current]}".` }, { status: 422 });
    const { order, from, logId } = setStatus(d.id, to);
    const [, event] = await Promise.all([
      sendOrderStatus(order.number, to),
      d.notify === false ? null : notifySelwise(d.id, from, to, logId),
    ]);
    return NextResponse.json({ ok: true, order: { number: order.number, status: order.status, statusLabel: order.statusLabel }, event });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
