import Link from 'next/link';
import { ArrowRight, RotateCcw, ShieldCheck, Store, Truck } from 'lucide-react';
import { CATEGORY_TREE } from '@/lib/catalog';
import { liveProducts } from '@/lib/store/products';
import { ProductRail } from '@/components/product/ProductGrid';
import { Slot, SLOTS } from '@/components/selwise/Slot';

function pickGroups<T extends { groupCode: string }>(list: T[], n: number) {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.groupCode) ? false : (seen.add(p.groupCode), true))).slice(0, n);
}

export default function HomePage() {
  const products = liveProducts();
  const newIn = pickGroups(
    [...products].filter((p) => p.isNew).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    8,
  );
  const picks = pickGroups(products.filter((p) => p.categorySlug === 'ev-yasam' || p.categorySlug === 'kozmetik'), 4);

  return (
    <div>
      {/* Stable ids: page experiments and the visual editor target these. */}
      <section id="home-hero" className="border-b border-line bg-sand">
        <div className="container grid items-center gap-8 py-10 md:grid-cols-2 md:py-16">
          <div className="max-w-xl">
            <p className="eyebrow" id="home-hero-eyebrow">Sonbahar / Kış 2026</p>
            <h1 id="home-hero-title" className="mt-4 font-display text-5xl leading-[1.05] md:text-6xl">
              Yavaş sezonun yumuşak dokuları
            </h1>
            <p id="home-hero-text" className="mt-5 text-base leading-relaxed text-ink-soft">
              Kaşmir karışımlı trikolar, yün kabanlar ve evin her köşesine sıcaklık katan parçalar. Yeni koleksiyon şimdi mağazada.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/c/yeni-gelenler" id="home-hero-cta" className="btn-primary">
                Koleksiyonu Keşfet <ArrowRight size={16} />
              </Link>
              <Link href="/c/indirim" id="home-hero-secondary" className="btn-outline">
                İndirimdekiler
              </Link>
            </div>
          </div>
          <div className="relative">
            <img src="/img/c/kadin-triko.svg" alt="Yeni sezon triko koleksiyonu" className="aspect-[5/4] w-full rounded-2xl object-cover" />
            <div className="absolute -bottom-4 left-4 rounded-xl bg-white px-5 py-4 shadow-pop md:-left-6">
              <p className="text-2xs uppercase tracking-label text-ink-muted">Üyelere özel</p>
              <p className="font-display text-xl">İlk siparişe %10</p>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <Slot name={SLOTS.homeHero} className="block" />

        <section className="mt-16" aria-labelledby="home-categories">
          <div className="flex items-end justify-between">
            <h2 id="home-categories" className="font-display text-3xl">Kategoriler</h2>
          </div>
          <div className="no-scrollbar -mx-4 mt-6 flex snap-x gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-7 md:px-0">
            {CATEGORY_TREE.map((c) => (
              <Link key={c.slug} href={`/c/${c.slug}`} className="group w-36 shrink-0 snap-start md:w-auto" id={`home-cat-${c.slug}`}>
                <div className="overflow-hidden rounded-full bg-sand">
                  <img src={`/img/c/${c.slug}.svg`} alt="" className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <p className="mt-3 text-center text-sm font-medium">{c.name}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16" aria-labelledby="home-new">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="eyebrow">Bu hafta</p>
              <h2 id="home-new" className="mt-1 font-display text-3xl">Yeni Gelenler</h2>
            </div>
            <Link href="/c/yeni-gelenler" className="link text-sm">Tümünü gör</Link>
          </div>
          <ProductRail products={newIn.slice(0, 4)} list="home_new_arrivals" />
        </section>

        <Slot name={SLOTS.homeRecs1} className="mt-16 block" />

        <section className="mt-16 grid gap-4 md:grid-cols-2" id="home-promos">
          <Link href="/c/indirim" className="group relative overflow-hidden rounded-2xl bg-[#EAD8CF]" id="home-promo-sale">
            <img src="/img/c/indirim.svg" alt="" className="aspect-[16/10] w-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 flex flex-col justify-end p-8">
              <p className="eyebrow text-ink-soft">Sezon sonu</p>
              <p className="mt-2 font-display text-4xl">%40'a varan indirim</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium">Alışverişe başla <ArrowRight size={16} /></span>
            </div>
          </Link>
          <Link href="/c/ev-yasam" className="group relative overflow-hidden rounded-2xl bg-[#E2E4D6]" id="home-promo-home">
            <img src="/img/c/ev-yasam.svg" alt="" className="aspect-[16/10] w-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 flex flex-col justify-end p-8">
              <p className="eyebrow text-ink-soft">Ardisa Home</p>
              <p className="mt-2 font-display text-4xl">Evin sıcak köşeleri</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium">Koleksiyonu gör <ArrowRight size={16} /></span>
            </div>
          </Link>
        </section>

        <Slot name={SLOTS.homeBanner} className="mt-16 block" />
        <Slot name={SLOTS.homeRecs2} className="mt-16 block" />

        <section className="mt-16 grid grid-cols-2 gap-6 rounded-2xl border border-line bg-white p-6 md:grid-cols-4 md:p-8" id="home-benefits">
          {[
            [Truck, 'Ücretsiz kargo', '750 TL ve üzeri siparişlerde'],
            [RotateCcw, '30 gün iade', 'Mağazadan veya kargoyla'],
            [ShieldCheck, 'Güvenli ödeme', '3D Secure ile korunur'],
            [Store, 'Mağazadan teslim', '24 mağazada ücretsiz'],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof Truck;
            return (
              <div key={title as string} className="flex items-start gap-3">
                <I size={22} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-semibold">{title as string}</p>
                  <p className="text-xs text-ink-muted">{text as string}</p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-16" aria-labelledby="home-picks">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="eyebrow">Editörün seçimi</p>
              <h2 id="home-picks" className="mt-1 font-display text-3xl">Ev ve bakım</h2>
            </div>
            <Link href="/c/ev-yasam" className="link text-sm">Tümünü gör</Link>
          </div>
          <ProductRail products={picks} list="home_editors_pick" />
        </section>

        <Slot name={SLOTS.homeRecs3} className="mt-16 block" />

        <section className="mt-20 grid items-center gap-10 md:grid-cols-2" id="home-story">
          <img src="/img/c/ev-tekstili.svg" alt="" className="aspect-[5/4] w-full rounded-2xl object-cover" />
          <div className="max-w-lg">
            <p className="eyebrow">Ardisa hakkında</p>
            <h2 className="mt-3 font-display text-4xl leading-tight">Az ama iyi. Uzun yıllar kullanılacak parçalar.</h2>
            <p className="mt-5 text-sm leading-relaxed text-ink-soft">
              2014'ten bu yana doğal liflerle, sorumlu üreticilerle çalışıyoruz. Koleksiyonlarımız İstanbul'daki tasarım ekibimizde hazırlanıyor ve
              24 mağazamızla birlikte ardisa'da satışa sunuluyor.
            </p>
            <Link href="/hakkimizda" className="btn-outline mt-8">Hikâyemiz</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
