import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readCartId } from '@/lib/store/cart';
import { quote, INSTALLMENT_RATES } from '@/lib/store/orders';

const Body = z.object({
  shippingMethod: z.enum(['standard', 'express', 'store']),
  paymentMethod: z.enum(['card', 'transfer', 'cod']),
  installments: z.number().int().default(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  const id = readCartId();
  if (!id) return NextResponse.json({ error: 'Sepet bulunamadı.' }, { status: 404 });
  const q = quote(id, parsed.data.shippingMethod, parsed.data.paymentMethod, parsed.data.installments);
  const options = Object.keys(INSTALLMENT_RATES).map((n) => {
    const qq = quote(id, parsed.data.shippingMethod, 'card', Number(n));
    return { n: Number(n), total: qq.total, monthly: Math.round((qq.total / Number(n)) * 100) / 100 };
  });
  return NextResponse.json({ ...q, installmentOptions: options });
}
