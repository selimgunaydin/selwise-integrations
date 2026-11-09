import { NextResponse } from 'next/server';
import { resolveProduct } from '@/lib/catalog';
import { applyOverride } from '@/lib/store/products';

export const dynamic = 'force-dynamic';

const MAX = 4;

export function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('codes') || '';
  const refs = Array.from(new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))).slice(0, MAX);
  if (refs.length === 0) return NextResponse.json({ products: [] });
  const products = refs
    .map((ref) => resolveProduct(ref))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map(applyOverride)
    .map((p) => ({
      code: p.code,
      slug: p.slug,
      title: p.title,
      brand: p.brand,
      price: p.price,
      listPrice: p.listPrice,
      discountRate: p.discountRate,
      colorName: p.colorName,
      colorHex: p.colorHex,
      material: p.material,
      spec: p.spec ?? null,
      rating: p.rating,
      reviewCount: p.reviewCount,
      categoryName: p.categoryName,
      subcategoryName: p.subcategoryName,
      sizes: p.sizes,
      image: `/img/p/${p.code}/1.svg`,
    }));
  return NextResponse.json({ products });
}
