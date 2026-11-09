import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/store/auth';
import { addItem, CartError, ensureCartId, loadCart, removeItem, setCoupon, setGift, setQty } from '@/lib/store/cart';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), code: z.string(), size: z.string(), qty: z.number().int().min(1).max(20) }),
  z.object({ action: z.literal('qty'), code: z.string(), size: z.string(), qty: z.number().int().min(0).max(20) }),
  z.object({ action: z.literal('remove'), code: z.string(), size: z.string() }),
  z.object({ action: z.literal('coupon'), code: z.string().nullable() }),
  z.object({ action: z.literal('gift'), wrap: z.boolean(), note: z.string().max(240).nullable() }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
  const body = parsed.data;
  const id = ensureCartId(currentUser());
  try {
    let added: { code: string; size: string } | null = null;
    switch (body.action) {
      case 'add': {
        const r = addItem(id, body.code, body.size, body.qty);
        added = { code: r.product.code, size: r.size };
        break;
      }
      case 'qty':
        setQty(id, body.code, body.size, body.qty);
        break;
      case 'remove':
        removeItem(id, body.code, body.size);
        break;
      case 'coupon':
        setCoupon(id, body.code);
        break;
      case 'gift':
        setGift(id, body.wrap, body.note);
        break;
    }
    const cart = loadCart(id);
    const line = added ? cart.lines.find((l) => l.code === added!.code && l.size === added!.size) : undefined;
    return NextResponse.json({ cart, line });
  } catch (e) {
    if (e instanceof CartError) return NextResponse.json({ error: e.message, cart: loadCart(id) }, { status: 422 });
    throw e;
  }
}
