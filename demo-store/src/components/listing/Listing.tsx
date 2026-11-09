import Link from 'next/link';
import { X } from 'lucide-react';
import type { Product } from '@/lib/catalog';
import { runListing, toQuery, type ListingParams, SORTS } from '@/lib/catalog/listing';
import { ProductGrid } from '../product/ProductGrid';
import { SortSelect } from './SortSelect';
import { MobileFilters } from './MobileFilters';

export interface Crumb {
  href: string;
  label: string;
}

function toggle(list: string[] | undefined, v: string) {
  const s = new Set(list || []);
  if (s.has(v)) s.delete(v);
  else s.add(v);
  return [...s];
}

export function Listing({
  basePath,
  products,
  params,
  title,
  description,
  crumbs,
  list,
  scores,
  hideCategoryFacet,
  empty,
  above,
  below,
}: {
  basePath: string;
  products: Product[];
  params: ListingParams;
  title: string;
  description?: string;
  crumbs: Crumb[];
  list: string;
  scores?: Map<string, number>;
  hideCategoryFacet?: boolean;
  empty?: React.ReactNode;
  above?: React.ReactNode;
  below?: React.ReactNode;
}) {
  const r = runListing(products, params, scores);
  const href = (patch: Partial<ListingParams>) => `${basePath}${toQuery(params, { ...patch, page: 1 })}`;

  const active: Array<{ label: string; href: string }> = [];
  for (const k of params.kategori || []) active.push({ label: r.facets.kategori.find((f) => f.key === k)?.label || k, href: href({ kategori: toggle(params.kategori, k) }) });
  for (const k of params.marka || []) active.push({ label: k, href: href({ marka: toggle(params.marka, k) }) });
  for (const k of params.renk || []) active.push({ label: r.facets.renk.find((f) => f.key === k)?.label || k, href: href({ renk: toggle(params.renk, k) }) });
  for (const k of params.beden || []) active.push({ label: `Beden ${k}`, href: href({ beden: toggle(params.beden, k) }) });
  for (const k of params.fiyat || []) active.push({ label: r.facets.fiyat.find((f) => f.key === k)?.label || k, href: href({ fiyat: toggle(params.fiyat, k) }) });
  if (params.indirimli) active.push({ label: 'İndirimli', href: href({ indirimli: false }) });
  if (params.stokta) active.push({ label: 'Stoktakiler', href: href({ stokta: false }) });

  const filters = (
    <div className="space-y-8">
      {!hideCategoryFacet && r.facets.kategori.length > 1 && (
        <FacetGroup title="Kategori">
          {r.facets.kategori.map((f) => (
            <FacetLink key={f.key} href={href({ kategori: toggle(params.kategori, f.key) })} active={!!params.kategori?.includes(f.key)} label={f.label} count={f.count} />
          ))}
        </FacetGroup>
      )}
      <FacetGroup title="Fiyat">
        {r.facets.fiyat.map((f) => (
          <FacetLink key={f.key} href={href({ fiyat: toggle(params.fiyat, f.key) })} active={!!params.fiyat?.includes(f.key)} label={f.label} count={f.count} />
        ))}
      </FacetGroup>
      {r.facets.renk.length > 1 && (
        <FacetGroup title="Renk">
          <div className="grid grid-cols-2 gap-2">
            {r.facets.renk.map((f) => {
              const on = !!params.renk?.includes(f.key);
              return (
                <Link key={f.key} href={href({ renk: toggle(params.renk, f.key) })} scroll={false} className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs ${on ? 'bg-sand font-semibold' : 'text-ink-soft hover:bg-sand'}`}>
                  <span className={`h-4 w-4 shrink-0 rounded-full border ${on ? 'ring-1 ring-ink ring-offset-1' : 'border-line-strong'}`} style={{ backgroundColor: f.hex }} />
                  <span className="truncate">{f.label}</span>
                </Link>
              );
            })}
          </div>
        </FacetGroup>
      )}
      {r.facets.beden.length > 0 && (
        <FacetGroup title="Beden">
          <div className="grid grid-cols-4 gap-1.5">
            {r.facets.beden.map((f) => {
              const on = !!params.beden?.includes(f.key);
              return (
                <Link key={f.key} href={href({ beden: toggle(params.beden, f.key) })} scroll={false} className={`flex h-9 items-center justify-center rounded-lg border text-xs ${on ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink'}`}>
                  {f.label}
                </Link>
              );
            })}
          </div>
        </FacetGroup>
      )}
      {r.facets.marka.length > 1 && (
        <FacetGroup title="Marka">
          {r.facets.marka.map((f) => (
            <FacetLink key={f.key} href={href({ marka: toggle(params.marka, f.key) })} active={!!params.marka?.includes(f.key)} label={f.label} count={f.count} />
          ))}
        </FacetGroup>
      )}
      <FacetGroup title="Diğer">
        <FacetLink href={href({ indirimli: !params.indirimli })} active={!!params.indirimli} label="Sadece indirimli ürünler" />
        <FacetLink href={href({ stokta: !params.stokta })} active={!!params.stokta} label="Sadece stoktakiler" />
      </FacetGroup>
    </div>
  );

  return (
    <div className="container pt-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1.5">
            {i > 0 && <span>/</span>}
            {i === crumbs.length - 1 ? <span className="text-ink">{c.label}</span> : <Link href={c.href} className="hover:text-ink">{c.label}</Link>}
          </span>
        ))}
      </nav>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl" id="listing-title">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{description}</p>}
        </div>
        <p className="text-sm text-ink-muted" id="listing-count">{r.total} ürün</p>
      </div>
      {above}
      <div className="mt-8 grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-label="Filtreler">
          {filters}
        </aside>
        <div>
          <div className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4">
            <MobileFilters count={active.length}>{filters}</MobileFilters>
            <div className="hidden flex-wrap gap-2 lg:flex">
              {active.map((a) => (
                <Link key={a.href + a.label} href={a.href} scroll={false} className="chip">
                  {a.label} <X size={12} />
                </Link>
              ))}
              {active.length > 0 && (
                <Link href={`${basePath}${params.q ? `?q=${encodeURIComponent(params.q)}` : ''}`} className="text-xs text-ink-muted underline underline-offset-4">
                  Tümünü temizle
                </Link>
              )}
            </div>
            <SortSelect value={params.sort} options={SORTS} />
          </div>
          {r.total === 0 ? (
            empty || (
              <div className="rounded-2xl border border-line bg-white p-10 text-center">
                <p className="font-display text-2xl">Sonuç bulunamadı</p>
                <p className="mt-2 text-sm text-ink-muted">Filtreleri azaltmayı deneyin.</p>
              </div>
            )
          ) : (
            <>
              <ProductGrid products={r.items} list={list} cols={3} resetKey={toQuery(params, {})} />
              <div className="mt-12 flex flex-col items-center gap-3">
                <p className="text-xs text-ink-muted">
                  {r.total} üründen {r.items.length} tanesini görüntülüyorsunuz
                </p>
                <div className="h-1 w-48 overflow-hidden rounded-full bg-sand">
                  <div className="h-full bg-ink" style={{ width: `${(r.items.length / r.total) * 100}%` }} />
                </div>
                {r.page < r.pages && (
                  <Link href={`${basePath}${toQuery(params, { page: r.page + 1 })}`} scroll={false} className="btn-outline mt-2" id="listing-load-more">
                    Daha Fazla Göster
                  </Link>
                )}
              </div>
            </>
          )}
          {below}
        </div>
      </div>
    </div>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-3">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FacetLink({ href, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return (
    <Link href={href} scroll={false} className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm ${active ? 'font-semibold text-ink' : 'text-ink-soft hover:text-ink'}`}>
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? 'border-ink bg-ink' : 'border-line-strong bg-white'}`}>
        {active && <span className="h-1.5 w-1.5 rounded-sm bg-paper" />}
      </span>
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-2xs text-ink-faint">{count}</span>}
    </Link>
  );
}

