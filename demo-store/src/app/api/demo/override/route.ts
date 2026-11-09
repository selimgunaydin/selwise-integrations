import { NextResponse } from 'next/server';
import { z } from 'zod';
import { panelAllowed } from '@/lib/store/panel-auth';
import { clearOverride, liveProduct, setOverride } from '@/lib/store/products';
import { getByCode } from '@/lib/catalog';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('price_drop'), code: z.string(), percent: z.number().min(1).max(90) }),
  z.object({ action: z.literal('set_price'), code: z.string(), price: z.number().positive() }),
  z.object({ action: z.literal('sell_out'), code: z.string() }),
  z.object({ action: z.literal('low_stock'), code: z.string(), units: z.number().int().min(1).max(5) }),
  z.object({ action: z.literal('restock'), code: z.string() }),
  z.object({ action: z.literal('reset'), code: z.string().optional() }),
]);

export async function POST(req: Request) {
  if (!panelAllowed()) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  const b = parsed.data;
  if (b.action === 'reset') {
    clearOverride(b.code);
    return NextResponse.json({ ok: true });
  }
  const base = getByCode(b.code);
  const live = liveProduct(b.code);
  if (!base || !live) return NextResponse.json({ error: 'Ürün bulunamadı.' }, { status: 404 });
  switch (b.action) {
    case 'price_drop':
      setOverride(b.code, { price: Math.round(live.price * (1 - b.percent / 100)), listPrice: live.listPrice });
      break;
    case 'set_price':
      setOverride(b.code, { price: b.price, listPrice: Math.max(live.listPrice, b.price) });
      break;
    case 'sell_out':
      setOverride(b.code, { sizes: live.sizes.map((s) => ({ ...s, stock: 0 })) });
      break;
    case 'low_stock':
      setOverride(b.code, { sizes: live.sizes.map((s, i) => ({ ...s, stock: i === 0 ? b.units : 0 })) });
      break;
    case 'restock':
      setOverride(b.code, { sizes: base.sizes.map((s) => ({ ...s, stock: Math.max(s.stock, 12) })) });
      break;
  }
  return NextResponse.json({ ok: true, product: liveProduct(b.code) });
}
