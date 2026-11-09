import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SHIPPING_METHODS, getOrderByNumber } from '@/lib/store/orders';
import { cargoTrackingNumber } from '@/lib/account/shared';

export const dynamic = 'force-dynamic';

const Body = z.object({
  number: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(120),
});

const NO_MATCH = 'Bu sipariş numarası ve e-posta adresiyle eşleşen bir sipariş bulamadık. Bilgileri kontrol edip tekrar deneyin.';

/**
 * Guest order tracking. A wrong number and a wrong e-mail answer the same way,
 * so the form cannot be used to find out which order numbers exist.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '');
    return NextResponse.json(
      { error: field === 'email' ? 'Geçerli bir e-posta adresi girin.' : 'Sipariş numaranızı girin.', field },
      { status: 400 },
    );
  }
  const order = getOrderByNumber(parsed.data.number);
  if (!order || order.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
    return NextResponse.json({ error: NO_MATCH }, { status: 404 });
  }
  const shipped = ['shipped', 'delivered', 'return_requested', 'returned'].includes(order.status);
  return NextResponse.json({
    order: {
      number: order.number,
      status: order.status,
      statusLabel: order.statusLabel,
      createdAt: order.createdAt,
      total: order.total,
      shippingMethod: SHIPPING_METHODS[order.shippingMethod]?.label ?? order.shippingMethod,
      trackingNumber: shipped && order.shippingMethod !== 'store' ? cargoTrackingNumber(order.number) : null,
      city: order.shippingAddress?.city ?? null,
      lines: order.lines.map((l) => ({
        code: l.code,
        slug: l.slug,
        title: l.title,
        colorName: l.colorName,
        size: l.size,
        qty: l.qty,
        lineTotal: l.lineTotal,
        image: l.image,
      })),
    },
  });
}
