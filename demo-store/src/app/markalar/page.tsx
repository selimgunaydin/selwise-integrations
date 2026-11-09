import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { liveProducts } from '@/lib/store/products';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Markalarımız',
  description: 'Ardisa, Ardisa Home, Ardisa Beauty ve Ardisa Active: Ardisa çatısı altındaki markalar.',
};

const COPY: Record<string, { tagline: string; text: string }> = {
  Ardisa: {
    tagline: 'Giyim, ayakkabı ve aksesuar',
    text: 'Markanın çıkış noktası: doğal liflerden, uzun yıllar giyilecek sade parçalar. Kadın ve erkek koleksiyonları, ayakkabı ve çanta.',
  },
  'Ardisa Home': {
    tagline: 'Ev tekstili ve ev kokuları',
    text: 'Keten nevresimler, yumuşak pikeler ve evin her köşesine sıcaklık katan kokular. Evde de aynı sade tasarım anlayışı.',
  },
  'Ardisa Beauty': {
    tagline: 'Makyaj, cilt ve saç bakımı',
    text: 'Kısa içerik listeleri, sade ambalajlar. Her gün kullanılacak bakım ürünleri ve kalıcı renkler.',
  },
  'Ardisa Active': {
    tagline: 'Spor ve hareket',
    text: 'Günlük hareket için nefes alan kumaşlar ve rahat kalıplar: yürüyüşten yogaya, şehirden doğaya.',
  },
};

interface BrandSummary {
  name: string;
  models: number;
  colours: number;
  categories: string[];
  image: string;
  minPrice: number;
  maxPrice: number;
  onSale: number;
}

/** Brands are whatever the catalogue carries — a new `brand` in the data shows up here by itself. */
function brands(): BrandSummary[] {
  interface Acc {
    groups: Set<string>;
    colours: number;
    categories: Map<string, number>;
    subs: Map<string, number>;
    prices: number[];
    onSale: number;
  }
  const map = new Map<string, Acc>();
  for (const p of liveProducts()) {
    const b: Acc = map.get(p.brand) || { groups: new Set(), colours: 0, categories: new Map(), subs: new Map(), prices: [], onSale: 0 };
    b.groups.add(p.groupCode);
    b.colours += 1;
    b.categories.set(p.categoryName, (b.categories.get(p.categoryName) || 0) + 1);
    b.subs.set(p.subcategorySlug, (b.subs.get(p.subcategorySlug) || 0) + 1);
    b.prices.push(p.price);
    if (p.discountRate > 0) b.onSale += 1;
    map.set(p.brand, b);
  }
  return Array.from(map.entries())
    .map(([name, b]) => ({
      name,
      models: b.groups.size,
      colours: b.colours,
      categories: Array.from(b.categories.entries()).sort((x, y) => y[1] - x[1]).map(([c]) => c),
      // The subcategory with most rows makes the most representative collage.
      image: `/img/c/${Array.from(b.subs.entries()).sort((x, y) => y[1] - x[1])[0][0]}.svg`,
      minPrice: Math.min(...b.prices),
      maxPrice: Math.max(...b.prices),
      onSale: b.onSale,
    }))
    .sort((a, b) => b.models - a.models);
}

export default function BrandsPage() {
  const list = brands();
  return (
    <div className="container py-10 md:py-16" id="brands">
      <div className="max-w-2xl">
        <p className="eyebrow">Markalarımız</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">Tek çatı, {list.length} marka</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Giyimden eve, bakımdan spora: Ardisa’nın her markası aynı ilkeyle tasarlanır — az ama iyi.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {list.map((b) => {
          const copy = COPY[b.name];
          return (
            <Link
              key={b.name}
              href={`/search?q=${encodeURIComponent(b.name)}`}
              className="group overflow-hidden rounded-2xl border border-line bg-white transition-colors hover:border-line-strong"
            >
              <div className="overflow-hidden bg-sand">
                <img src={b.image} alt="" className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              </div>
              <div className="p-6">
                <p className="eyebrow">{copy?.tagline ?? b.categories.join(', ')}</p>
                <h2 className="mt-2 font-display text-3xl">{b.name}</h2>
                {copy && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{copy.text}</p>}
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs">
                  <div>
                    <dt className="text-ink-muted">Model</dt>
                    <dd className="mt-0.5 font-medium">{b.models} model · {b.colours} renk</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Fiyat aralığı</dt>
                    <dd className="mt-0.5 font-medium">
                      {formatPrice(b.minPrice).replace(',00', '')} – {formatPrice(b.maxPrice).replace(',00', '')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">İndirimde</dt>
                    <dd className="mt-0.5 font-medium">{b.onSale > 0 ? `${b.onSale} ürün` : 'Yok'}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-2xs text-ink-muted">{b.categories.join(' · ')}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium">
                  {b.name} ürünlerini gör <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
