import type { Metadata } from 'next';
import Link from 'next/link';
import { liveProducts } from '@/lib/store/products';
import { parseParams, searchScore } from '@/lib/catalog/listing';
import { Listing } from '@/components/listing/Listing';
import { Slot, SLOTS } from '@/components/selwise/Slot';

type Props = { searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ searchParams }: Props): Metadata {
  const q = typeof searchParams.q === 'string' ? searchParams.q : '';
  return { title: q ? `"${q}" için sonuçlar` : 'Arama' };
}

const POPULAR = ['keten elbise', 'triko', 'sneaker', 'mom jean', 'ruj', 'mum', 'kaban', 'tote çanta'];

/**
 * The store's OWN results page (its own engine). Selwise search, when it is
 * switched on, lives in the header overlay and its "view all" lands here; this
 * page records no search events of its own, so a search is never counted twice.
 */
export default function SearchPage({ searchParams }: Props) {
  const f = parseParams(searchParams);
  const q = (f.q || '').trim();
  const all = liveProducts();
  const scores = new Map<string, number>();
  const base = q
    ? all.filter((p) => {
        const s = searchScore(p, q);
        if (s > 0) scores.set(p.code, s);
        return s > 0;
      })
    : [];

  if (!q) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <h1 className="font-display text-4xl">Ne aramıştınız?</h1>
        <form action="/search" className="mt-8 flex gap-2">
          <input name="q" className="input" placeholder="Ürün, kategori veya renk" autoFocus />
          <button className="btn-primary shrink-0">Ara</button>
        </form>
        <p className="eyebrow mt-10">Popüler aramalar</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {POPULAR.map((p) => (
            <Link key={p} href={`/search?q=${encodeURIComponent(p)}`} className="chip">{p}</Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Listing
      basePath="/search"
      products={base}
      params={f}
      scores={scores}
      title={`“${q}” için sonuçlar`}
      crumbs={[{ href: '/', label: 'Ana Sayfa' }, { href: `/search?q=${encodeURIComponent(q)}`, label: 'Arama' }]}
      list="search_results"
      above={<Slot name={SLOTS.searchTop} className="mt-6 block" />}
      empty={
        <div id="search-empty">
          <div className="rounded-2xl border border-line bg-white p-10 text-center">
            <p className="font-display text-2xl">“{q}” için sonuç bulamadık</p>
            <p className="mt-2 text-sm text-ink-muted">Yazımı kontrol edin ya da daha genel bir kelimeyle arayın.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {POPULAR.slice(0, 6).map((p) => (
                <Link key={p} href={`/search?q=${encodeURIComponent(p)}`} className="chip">{p}</Link>
              ))}
            </div>
          </div>
          <Slot name={SLOTS.searchEmpty} className="mt-12 block" />
        </div>
      }
    />
  );
}
