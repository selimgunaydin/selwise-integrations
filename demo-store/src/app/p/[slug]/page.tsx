import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Truck, RotateCcw, Store } from 'lucide-react';
import { getBySlug, getSiblings } from '@/lib/catalog';
import { applyOverride } from '@/lib/store/products';
import { Price } from '@/components/product/Price';
import { Rating } from '@/components/product/Rating';
import { Gallery } from '@/components/pdp/Gallery';
import { BuyBox } from '@/components/pdp/BuyBox';
import { Accordion } from '@/components/pdp/Accordion';
import { Reviews } from '@/components/pdp/Reviews';
import { Slot, SLOTS } from '@/components/selwise/Slot';
import { getSelwiseEnrichmentSlots } from '@/lib/selwise/ssr';
import { selwiseConfig } from '@/lib/selwise/config';
import { formatPrice } from '@/lib/format';
import { generatedReviews, ratingHistogram } from '@/lib/catalog/reviews';
import { db } from '@/lib/store/db';

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const p = getBySlug(params.slug);
  if (!p) return {};
  return {
    title: p.title,
    description: p.description.slice(0, 155),
    openGraph: { images: [`${selwiseConfig().publicUrl}/img/p/${p.code}/1.svg`] },
  };
}

function deliveryWindow() {
  const d = new Date();
  const add = (n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });
  };
  return `${add(2)} - ${add(4)}`;
}

export default async function ProductPage({ params }: Props) {
  const base = getBySlug(params.slug);
  if (!base) notFound();
  const p = applyOverride(base);
  const siblings = getSiblings(base).map(applyOverride);
  const cfg = selwiseConfig();

  // Server-side enrichment: content prepared in the Selwise dashboard arrives in
  // the HTML itself (crawlers see it); the widget only takes over tracking.
  const ssr = await getSelwiseEnrichmentSlots(p.code, [SLOTS.pdpEnrichment]);
  const ssrHtml = ssr.slots[SLOTS.pdpEnrichment]?.html || '';

  const stored = db()
    .prepare('SELECT author, rating, title, body, created_at as date FROM reviews WHERE group_code = ? ORDER BY created_at DESC')
    .all(p.groupCode) as Array<{ author: string; rating: number; title: string; body: string; date: string }>;
  const reviews = [...stored.map((r) => ({ ...r, verified: true })), ...generatedReviews(p)];

  const totalStock = p.sizes.reduce((s, x) => s + x.stock, 0);
  const availability = totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    // `sku` is what Selwise reads as THE product code of this page.
    sku: p.code,
    productID: p.code,
    mpn: p.groupCode,
    name: p.title,
    description: p.description,
    brand: { '@type': 'Brand', name: p.brand },
    category: p.categoryPath.join(' > '),
    color: p.colorName,
    image: [1, 2, 3].map((n) => `${cfg.publicUrl}/img/p/${p.code}/${n}.svg`),
    aggregateRating: p.reviewCount ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviewCount } : undefined,
    offers: {
      '@type': 'Offer',
      url: `${cfg.publicUrl}/p/${p.slug}`,
      priceCurrency: 'TRY',
      price: p.price.toFixed(2),
      availability,
    },
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${cfg.publicUrl}/` },
      { '@type': 'ListItem', position: 2, name: p.categoryName, item: `${cfg.publicUrl}/c/${p.categorySlug}` },
      { '@type': 'ListItem', position: 3, name: p.subcategoryName, item: `${cfg.publicUrl}/c/${p.subcategorySlug}` },
    ],
  };

  return (
    <div className="container pt-6" data-product-sku={p.code} id="pdp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {ssr.css && <style dangerouslySetInnerHTML={{ __html: ssr.css }} />}

      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink">Ana Sayfa</Link> <span>/</span>
        <Link href={`/c/${p.categorySlug}`} className="hover:text-ink">{p.categoryName}</Link> <span>/</span>
        <Link href={`/c/${p.subcategorySlug}`} className="hover:text-ink">{p.subcategoryName}</Link> <span>/</span>
        <span className="text-ink">{p.title}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr] xl:gap-16">
        <Gallery code={p.code} title={p.title} />

        <div className="lg:sticky lg:top-28 lg:self-start">
          <p lang="en" className="eyebrow">{p.brand}</p>
          <h1 className="mt-2 font-display text-3xl leading-tight md:text-4xl" id="pdp-title">{p.title}</h1>
          <div className="mt-3 flex items-center gap-3">
            <a href="#reviews"><Rating value={p.rating} count={p.reviewCount} size={14} /></a>
            <span className="text-2xs text-ink-faint">Ürün kodu: {p.code}</span>
          </div>
          <div className="mt-5" id="pdp-price">
            <Price price={p.price} listPrice={p.listPrice} size="lg" />
            <p className="mt-1 text-xs text-ink-muted">
              Peşin fiyatına 3 taksit · aylık {formatPrice(Math.round((p.price / 3) * 100) / 100)}'den başlayan taksitlerle
            </p>
          </div>
          <Slot name={SLOTS.pdpPrice} className="mt-3 block" />

          {siblings.length > 1 && (
            <div className="mt-6">
              <p className="text-sm">
                Renk: <span className="font-medium">{p.colorName}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {siblings.map((s) => {
                  const out = s.sizes.every((x) => x.stock <= 0);
                  return (
                    <Link
                      key={s.code}
                      href={`/p/${s.slug}`}
                      scroll={false}
                      title={`${s.colorName}${out ? ' (tükendi)' : ''}`}
                      className={`relative h-16 w-[52px] overflow-hidden rounded-lg border ${s.code === p.code ? 'border-ink ring-1 ring-ink' : 'border-line-strong hover:border-ink'}`}
                    >
                      <img src={`/img/p/${s.code}/1.svg`} alt={s.colorName} className={`h-full w-full object-cover ${out ? 'opacity-40' : ''}`} />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <BuyBox
            product={{
              code: p.code,
              cartCode: p.cartCode,
              title: p.title,
              price: p.price,
              listPrice: p.listPrice,
              sizes: p.sizes,
              sizeScale: p.sizeScale,
              categorySlug: p.categorySlug,
              image: `/img/p/${p.code}/1.svg`,
            }}
          />

          <div className="mt-8 divide-y divide-line rounded-xl border border-line bg-white text-sm">
            <div className="flex items-start gap-3 p-4">
              <Truck size={18} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.6} />
              <div>
                <p className="font-medium">Tahmini teslimat: {deliveryWindow()}</p>
                <p className="text-xs text-ink-muted">750 TL ve üzeri siparişlerde kargo ücretsiz.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4">
              <Store size={18} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.6} />
              <div>
                <p className="font-medium">Mağazadan ücretsiz teslim al</p>
                <p className="text-xs text-ink-muted">İstanbul, Ankara ve İzmir'deki mağazalarımızda.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4">
              <RotateCcw size={18} className="mt-0.5 shrink-0 text-accent" strokeWidth={1.6} />
              <div>
                <p className="font-medium">30 gün içinde ücretsiz iade</p>
                <p className="text-xs text-ink-muted">Kargo ile veya mağazadan iade edebilirsiniz.</p>
              </div>
            </div>
          </div>

          <Accordion
            className="mt-8"
            items={[
              {
                title: 'Ürün Açıklaması',
                open: true,
                body: (
                  <div className="space-y-4 text-sm leading-relaxed text-ink-soft" id="pdp-description">
                    <p>{p.description}</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
                      <dt className="text-ink-muted">Renk</dt>
                      <dd>{p.colorName}</dd>
                      <dt className="text-ink-muted">Malzeme</dt>
                      <dd>{p.material}</dd>
                      {p.spec && (
                        <>
                          <dt className="text-ink-muted">Ölçü / İçerik</dt>
                          <dd>{p.spec}</dd>
                        </>
                      )}
                      {Object.entries(p.attrs)
                        .filter(([k]) => !['malzeme', 'olcu_icerik'].includes(k))
                        .map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className="capitalize text-ink-muted">{k.replace(/_/g, ' ')}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                      {p.gender && (
                        <>
                          <dt className="text-ink-muted">Cinsiyet</dt>
                          <dd>{p.gender}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                ),
              },
              { title: 'Bakım Talimatı', body: <p className="text-sm text-ink-soft">{p.care}</p> },
              {
                title: 'Teslimat ve İade',
                body: (
                  <p className="text-sm text-ink-soft">
                    Siparişleriniz 1-2 iş günü içinde kargoya verilir. Ürünü teslim aldığınız tarihten itibaren 30 gün içinde ücretsiz iade
                    edebilirsiniz. Ayrıntılar için <Link className="link" href="/sozlesmeler/iade-kosullari">iade koşullarına</Link> bakın.
                  </p>
                ),
              },
            ]}
          />
          {/* Enrichment anchor: server-rendered content when the rule renders on the
              server, otherwise the widget fills it in the browser. */}
          {ssrHtml ? (
            <div data-selwise-slot={SLOTS.pdpEnrichment} className="mt-6 block" dangerouslySetInnerHTML={{ __html: ssrHtml }} />
          ) : (
            <Slot name={SLOTS.pdpEnrichment} className="mt-6 block" />
          )}
        </div>
      </div>

      <Slot name={SLOTS.pdpLook} className="mt-20 block" />
      <Slot name={SLOTS.pdpRecs1} className="mt-16 block" />
      <Slot name={SLOTS.pdpRecs2} className="mt-16 block" />

      <Reviews
        groupCode={p.groupCode}
        rating={p.rating}
        count={p.reviewCount + stored.length}
        histogram={ratingHistogram(p)}
        reviews={reviews}
        productTitle={p.name}
      />
    </div>
  );
}
