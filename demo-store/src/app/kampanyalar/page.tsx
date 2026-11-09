import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Truck } from 'lucide-react';
import { liveProducts } from '@/lib/store/products';
import { getCoupon } from '@/lib/store/cart';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/store/constants';
import { formatPrice } from '@/lib/format';
import { CopyButton } from '@/components/account/CopyButton';

export const metadata: Metadata = {
  title: 'Kampanyalar',
  description: 'Ardisa’daki güncel kampanyalar: sezon sonu indirimi, üyelere özel kodlar ve ücretsiz kargo.',
};

interface Campaign {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  cta: string;
  image?: string;
  bg: string;
  code?: string;
  terms: string;
}

export default function CampaignsPage() {
  const products = liveProducts();
  const onSale = products.filter((p) => p.discountRate > 0).length;
  const newIn = products.filter((p) => p.isNew).length;
  const freeShipping = formatPrice(FREE_SHIPPING_THRESHOLD).replace(',00', '');

  // Coupon cards show only while their code still works at the basket.
  const campaigns: Campaign[] = [
    {
      id: 'sezon-sonu',
      eyebrow: 'Sezon sonu',
      title: "%40'a varan sezon sonu indirimi",
      text: `Seçili ${onSale} üründe sezon sonu fiyatları. Stoklarla sınırlıdır.`,
      href: '/c/indirim',
      cta: 'İndirimdekileri gör',
      image: '/img/c/indirim.svg',
      bg: 'bg-[#EAD8CF]',
      terms: 'İndirimli fiyatlar ürün sayfasında gösterilir; kupon kodlarıyla birlikte kullanılabilir.',
    },
    {
      id: 'hosgeldin',
      eyebrow: 'Üyelere özel',
      title: 'İlk siparişe %10 indirim',
      text: 'Ücretsiz üye olun, ilk siparişinizde HOSGELDIN10 koduyla %10 indirim kazanın.',
      href: '/register',
      cta: 'Hemen üye ol',
      bg: 'bg-sand',
      code: 'HOSGELDIN10',
      terms: 'Yalnızca üyelerin ilk siparişinde geçerlidir. Başka bir kuponla birleştirilemez.',
    },
    {
      id: 'ardisa15',
      eyebrow: 'Sepette indirim',
      title: '1.000 TL üzeri %15 indirim',
      text: '1.000 TL ve üzeri alışverişlerinizde ARDISA15 koduyla sepette %15 indirim.',
      href: '/c/cok-satanlar',
      cta: 'Çok satanları keşfet',
      bg: 'bg-[#E2E4D6]',
      code: 'ARDISA15',
      terms: 'İndirim, kupon uygulandıktan sonraki sepet tutarı 1.000 TL ve üzerindeyse geçerlidir.',
    },
    {
      id: 'kargo',
      eyebrow: 'Her gün',
      title: `${freeShipping} üzeri ücretsiz kargo`,
      text: `${freeShipping} ve üzeri siparişlerde standart kargo bizden. Mağazadan teslim her zaman ücretsiz.`,
      href: '/c/cok-satanlar',
      cta: 'Alışverişe başla',
      bg: 'bg-[#DCE0E2]',
      terms: 'Hızlı teslimat seçeneğine uygulanmaz.',
    },
    {
      id: 'yeni-sezon',
      eyebrow: 'Yeni sezon',
      title: 'Sonbahar / Kış 2026',
      text: `Kaşmir karışımlı trikolar, yün kabanlar ve ${newIn} yeni ürün. Yeni koleksiyon şimdi mağazada.`,
      href: '/c/yeni-gelenler',
      cta: 'Yeni gelenleri gör',
      image: '/img/c/yeni-gelenler.svg',
      bg: 'bg-[#EADFD3]',
      terms: 'Yeni sezon ürünleri sınırlı stoklarla satışa sunulur.',
    },
  ].filter((c) => !c.code || getCoupon(c.code));

  const [hero, ...rest] = campaigns;

  return (
    <div className="container py-10 md:py-16" id="campaigns">
      <div className="max-w-2xl">
        <p className="eyebrow">Kampanyalar</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">Güncel fırsatlar</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Kupon kodlarını sepet sayfasındaki kupon alanına girerek kullanabilirsiniz. Her siparişte tek kupon geçerlidir.
        </p>
      </div>

      {hero && (
        <Link
          href={hero.href}
          id={`campaign-${hero.id}`}
          className={`group relative mt-10 grid overflow-hidden rounded-2xl md:grid-cols-2 ${hero.bg}`}
        >
          <div className="flex flex-col justify-center p-8 md:p-12">
            <p className="eyebrow text-ink-soft">{hero.eyebrow}</p>
            <h2 className="mt-3 font-display text-4xl leading-tight md:text-5xl">{hero.title}</h2>
            <p className="mt-4 max-w-md text-sm text-ink-soft">{hero.text}</p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium">
              {hero.cta} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </span>
            <p className="mt-6 text-2xs text-ink-muted">{hero.terms}</p>
          </div>
          {hero.image && <img src={hero.image} alt="" className="aspect-[16/10] h-full w-full object-cover md:aspect-auto" />}
        </Link>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {rest.map((c) => (
          <article key={c.id} id={`campaign-${c.id}`} className={`flex flex-col overflow-hidden rounded-2xl ${c.bg}`}>
            {c.image && <img src={c.image} alt="" className="aspect-[16/8] w-full object-cover" />}
            <div className="flex flex-1 flex-col p-7 md:p-8">
              <p className="eyebrow text-ink-soft">{c.eyebrow}</p>
              <h2 className="mt-2 flex items-center gap-2 font-display text-3xl leading-tight">
                {c.id === 'kargo' && <Truck size={26} strokeWidth={1.4} className="shrink-0 text-accent" aria-hidden />}
                {c.title}
              </h2>
              <p className="mt-3 text-sm text-ink-soft">{c.text}</p>
              {c.code && (
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-ink/25 bg-white/70 p-3">
                  <span className="font-mono text-base font-semibold tracking-wider">{c.code}</span>
                  <CopyButton value={c.code} className="btn-primary btn-sm ml-auto" />
                </div>
              )}
              <div className="mt-auto pt-6">
                <Link href={c.href} className="inline-flex items-center gap-2 text-sm font-medium hover:underline">
                  {c.cta} <ArrowRight size={16} />
                </Link>
                <p className="mt-3 text-2xs text-ink-muted">{c.terms}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-10 text-xs text-ink-faint">
        Ardisa bir demo mağazadır; kampanyalar Selwise senaryolarını denemek için tanımlanmıştır ve gerçek bir indirim taahhüdü içermez.
      </p>
    </div>
  );
}
