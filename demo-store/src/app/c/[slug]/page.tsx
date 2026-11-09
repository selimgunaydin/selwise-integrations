import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { COLLECTIONS, findCategory, isCollection } from '@/lib/catalog';
import { parseParams } from '@/lib/catalog/listing';
import { liveProducts } from '@/lib/store/products';
import { Listing } from '@/components/listing/Listing';
import { CategoryViewTracker } from '@/components/listing/CategoryViewTracker';
import { Slot, SLOTS } from '@/components/selwise/Slot';

type Props = { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> };

function resolve(slug: string) {
  if (isCollection(slug)) return { kind: 'collection' as const, ...COLLECTIONS[slug] };
  const found = findCategory(slug);
  if (!found) return null;
  return { kind: 'category' as const, found };
}

export function generateMetadata({ params }: Props): Metadata {
  const r = resolve(params.slug);
  if (!r) return {};
  return { title: r.kind === 'collection' ? r.name : r.found.sub?.name ? `${r.found.sub.name} — ${r.found.category.name}` : r.found.category.name };
}

export default function CategoryPage({ params, searchParams }: Props) {
  const r = resolve(params.slug);
  if (!r) notFound();
  const all = liveProducts();
  const f = parseParams(searchParams);

  if (r.kind === 'collection') {
    const slug = params.slug as keyof typeof COLLECTIONS;
    const base =
      slug === 'indirim' ? all.filter((p) => p.discountRate > 0) : slug === 'yeni-gelenler' ? all.filter((p) => p.isNew) : all.filter((p) => p.isBestseller);
    if (slug === 'yeni-gelenler' && f.sort === 'onerilen') f.sort = 'yeni';
    return (
      <>
        <CategoryViewTracker path={[r.name]} slug={params.slug} count={base.length} />
        <Listing
          basePath={`/c/${params.slug}`}
          products={base}
          params={f}
          title={r.name}
          description={r.description}
          crumbs={[{ href: '/', label: 'Ana Sayfa' }, { href: `/c/${params.slug}`, label: r.name }]}
          list={`collection_${params.slug}`}
          above={<Slot name={SLOTS.listingTop} className="mt-6 block" />}
          below={<Slot name={SLOTS.listingBottom} className="mt-16 block" />}
        />
      </>
    );
  }

  const { category, sub } = r.found;
  const base = sub ? all.filter((p) => p.subcategorySlug === sub.slug) : all.filter((p) => p.categorySlug === category.slug);
  const path = sub ? [category.name, sub.name] : [category.name];
  return (
    <>
      <CategoryViewTracker path={path} slug={params.slug} count={base.length} />
      <Listing
        basePath={`/c/${params.slug}`}
        products={base}
        params={f}
        title={sub ? sub.name : category.name}
        description={sub ? undefined : category.description}
        crumbs={[
          { href: '/', label: 'Ana Sayfa' },
          { href: `/c/${category.slug}`, label: category.name },
          ...(sub ? [{ href: `/c/${sub.slug}`, label: sub.name }] : []),
        ]}
        list={`category_${params.slug}`}
        hideCategoryFacet={!!sub}
        above={
          <>
            {!sub && (
              <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto">
                {category.children.map((c) => (
                  <Link key={c.slug} href={`/c/${c.slug}`} className="chip shrink-0">
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
            <Slot name={SLOTS.listingTop} className="mt-6 block" />
          </>
        }
        below={<Slot name={SLOTS.listingBottom} className="mt-16 block" />}
      />
    </>
  );
}
