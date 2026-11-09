import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/store/auth';
import { requestCancellation } from '@/lib/store/orders';
import { sendOrderStatus } from '@/lib/selwise/server';
import { findUserOrder } from '@/lib/account/server';
import { REQUEST_REASONS, requestKindFor } from '@/lib/account/shared';

export const dynamic = 'force-dynamic';

const Body = z.object({
  number: z.string().trim().min(4).max(40),
  kind: z.enum(['cancel', 'return']),
  codes: z.array(z.string().min(1).max(64)).min(1).max(50),
  reason: z.enum(REQUEST_REASONS),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '');
    const msg = field === 'codes' ? 'En az bir ürün seçin.' : field === 'reason' ? 'Bir neden seçin.' : field === 'note' ? 'Not en fazla 500 karakter olabilir.' : 'Geçersiz istek.';
    return NextResponse.json({ error: msg, field }, { status: 400 });
  }
  const d = parsed.data;
  const order = findUserOrder(user.id, d.number);
  if (!order) return NextResponse.json({ error: 'Sipariş bulunamadı.' }, { status: 404 });

  const allowed = requestKindFor(order.status);
  if (allowed !== d.kind) {
    const msg =
      d.kind === 'cancel'
        ? 'Bu sipariş kargoya verildiği için iptal edilemez; teslim aldıktan sonra iade talebi oluşturabilirsiniz.'
        : 'Bu sipariş için şu anda iade talebi oluşturulamaz.';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  const known = new Set(order.lines.map((l) => l.code));
  const codes = Array.from(new Set(d.codes));
  if (codes.some((c) => !known.has(c))) return NextResponse.json({ error: 'Seçilen ürünler bu siparişte yok.' }, { status: 400 });

  try {
    const updated = requestCancellation(order.id, d.kind, codes, d.reason, d.note);
    // A cancellation takes the order out of revenue; a return REQUEST does not yet.
    if (d.kind === 'cancel') await sendOrderStatus(d.number, 'cancelled');
    return NextResponse.json({ ok: true, status: updated.status, statusLabel: updated.statusLabel });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Talep oluşturulamadı.' }, { status: 400 });
  }
}
