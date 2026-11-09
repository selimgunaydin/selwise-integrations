import { CATEGORY_TREE } from '@/lib/catalog';

export interface MenuCategory {
  slug: string;
  name: string;
  /** What the top bar prints; the mega panel and mobile menu use `name`. */
  short: string;
  children: Array<{ slug: string; name: string }>;
  featured: Array<{ slug: string; name: string }>;
}

const SHORT: Record<string, string> = { 'canta-aksesuar': 'Aksesuar', kozmetik: 'Kozmetik' };

export function buildMenu(): MenuCategory[] {
  return CATEGORY_TREE.map((c) => ({
    slug: c.slug,
    name: c.name,
    short: SHORT[c.slug] || c.name,
    children: c.children.map((s) => ({ slug: s.slug, name: s.name })),
    featured: c.children.slice(0, 2).map((s) => ({ slug: s.slug, name: s.name })),
  }));
}
