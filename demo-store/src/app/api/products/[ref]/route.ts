import { NextResponse } from 'next/server';
import { resolveProduct, resolveSizeRef } from '@/lib/catalog';
import { applyOverride } from '@/lib/store/products';

export function GET(_req: Request, { params }: { params: { ref: string } }) {
  const ref = decodeURIComponent(params.ref);
  const base = resolveProduct(ref);
  if (!base) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const p = applyOverride(base);
  return NextResponse.json({
    code: p.code,
    cartCode: p.cartCode,
    title: p.title,
    slug: p.slug,
    price: p.price,
    listPrice: p.listPrice,
    image: `/img/p/${p.code}/1.svg`,
    sizes: p.sizes,
    // The ref named one size (a Selwise card's chosen option): add that one.
    size: resolveSizeRef(ref)?.size ?? null,
  });
}
