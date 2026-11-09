import Link from 'next/link';
import { Search } from 'lucide-react';
import { CATEGORY_TREE } from '@/lib/catalog';
import { Slot, SLOTS } from '@/components/selwise/Slot';

/**
 * Unknown URLs and every `notFound()` (a product that left the catalogue, an
 * order that is not yours) land here. The search form is a plain GET so it
 * works before hydration and without Selwise.
 */
export default function NotFound() {
  return (
    <div className="container py-14 md:py-20" id="not-found">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Hata 404</p>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">Aradığınız sayfayı bulamadık</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Sayfa taşınmış, ürün satıştan kaldırılmış ya da adres yanlış yazılmış olabilir. Aradığınızı bulmak için arama yapabilir veya
          kategorilere göz atabilirsiniz.
        </p>

        <form action="/search" method="get" role="search" className="relative mx-auto mt-8 max-w-md">
          <label htmlFor="nf-search" className="sr-only">Ürün ara</label>
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input id="nf-search" name="q" type="search" required placeholder="Ürün, kategori veya renk ara" className="input rounded-full pl-11 pr-28" autoComplete="off" />
          <button className="btn-primary btn-sm absolute right-1.5 top-1/2 -translate-y-1/2">Ara</button>
        </form>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {CATEGORY_TREE.map((c) => (
            <Link key={c.slug} href={`/c/${c.slug}`} className="chip">
              {c.name}
            </Link>
          ))}
          <Link href="/c/indirim" className="chip font-medium text-sale">
            İndirim
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-outline btn-sm">Ana Sayfaya Dön</Link>
          <Link href="/yardim" className="btn-ghost btn-sm">Yardım</Link>
        </div>
      </div>

      <Slot name={SLOTS.notFoundRecs} className="mt-16 block" />
    </div>
  );
}
