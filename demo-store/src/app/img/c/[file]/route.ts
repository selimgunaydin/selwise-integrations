import { PRODUCTS, findCategory, isCollection } from '@/lib/catalog';
import { renderCollage } from '@/lib/art/render';

const BG: Record<string, string> = {
  kadin: '#EADFD3',
  erkek: '#DCE0E2',
  ayakkabi: '#E7E1D6',
  'canta-aksesuar': '#E9DDD5',
  kozmetik: '#F0DCD8',
  'ev-yasam': '#E2E4D6',
  spor: '#DDE3E6',
};

export function GET(_req: Request, { params }: { params: { file: string } }) {
  const slug = params.file.replace(/\.svg$/, '');
  let items = PRODUCTS.filter((p) => p.subcategorySlug === slug || p.categorySlug === slug);
  if (isCollection(slug)) {
    items = PRODUCTS.filter((p) => (slug === 'indirim' ? p.discountRate > 0 : slug === 'yeni-gelenler' ? p.isNew : p.isBestseller));
  }
  if (items.length === 0) return new Response('Not found', { status: 404 });
  // One per group, spread across the list, so a collage shows variety.
  const seen = new Set<string>();
  const unique = items.filter((p) => (seen.has(p.groupCode) ? false : (seen.add(p.groupCode), true)));
  const pick = [unique[0], unique[Math.floor(unique.length / 2)], unique[unique.length - 1]].filter(Boolean);
  const found = findCategory(slug);
  const bg = BG[found?.category.slug || ''] || '#EAE4DA';
  return new Response(renderCollage(pick, bg), {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=604800' },
  });
}
