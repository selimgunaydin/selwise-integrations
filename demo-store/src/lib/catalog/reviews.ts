/**
 * Generated reviews for the demo catalogue. Fictional products, fictional
 * reviewers — the store says it is a demo on every page.
 */
import type { Product } from './index';
import { rng } from './index';

const NAMES = ['Ayşe K.', 'Zeynep T.', 'Elif D.', 'Merve A.', 'Can Y.', 'Burak Ö.', 'Deniz S.', 'Ece B.', 'Mert Ç.', 'Selin G.', 'Emre K.', 'Buse A.', 'Okan T.', 'İpek Y.', 'Cem E.', 'Gizem U.'];

const BY_KIND: Record<string, Array<[string, string]>> = {
  apparel: [
    ['Kalıbı tam oturdu', 'Normal bedenimi aldım, tam oldu. Kumaşı yıkamadan sonra da formunu korudu.'],
    ['Rengi fotoğraftaki gibi', 'Ekranda gördüğüm renkle birebir aynı geldi. Dikişleri de özenli.'],
    ['Biraz bol', 'Kalıbı biraz geniş, bir küçük beden alsam daha iyi olurdu. Kalitesi güzel.'],
    ['Gardırobun temeli oldu', 'İkinci rengini de sipariş ettim, her şeyle kombinlenebiliyor.'],
    ['Kargo hızlıydı', 'Ertesi gün elimdeydi. Paketleme de çok şıktı.'],
  ],
  shoe: [
    ['Çok rahat', 'İlk günden vurmadı, gün boyu giydim. Taban yumuşak.'],
    ['Numarası tam', 'Normal numaramı aldım, tam oldu. Deri kalitesi güzel.'],
    ['Biraz dar', 'Ayak genişliği olanlar bir büyük numara almalı.'],
  ],
  beauty: [
    ['Kalıcılığı harika', 'Sabah sürdüm, akşama kadar kaldı. Cildimi kurutmadı.'],
    ['Kokusu çok hoş', 'Ağır değil, gün boyu hafifçe hissediliyor.'],
    ['Tekrar alırım', 'Fiyatına göre performansı çok iyi.'],
  ],
  home: [
    ['Evime çok yakıştı', 'Fotoğraflardan daha güzel. Hediye olarak da aldım.'],
    ['Kaliteli malzeme', 'Ağır ve sağlam, uzun yıllar kullanılır.'],
    ['Paketleme özenliydi', 'Kırılmadan, çok güzel paketlenmiş halde geldi.'],
  ],
};

function kind(p: Product) {
  if (p.categorySlug === 'ayakkabi') return 'shoe';
  if (p.categorySlug === 'kozmetik') return 'beauty';
  if (p.categorySlug === 'ev-yasam' || p.subcategorySlug === 'spor-ekipman') return 'home';
  return 'apparel';
}

export interface Review {
  author: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
}

export function generatedReviews(p: Product): Review[] {
  const n = Math.min(p.reviewCount, 6);
  const r = rng(`reviews-${p.groupCode}`);
  const pool = BY_KIND[kind(p)];
  return Array.from({ length: n }, (_, i) => {
    const [title, body] = pool[Math.floor(r() * pool.length)];
    const rating = Math.max(3, Math.min(5, Math.round(p.rating + (r() - 0.5) * 1.6)));
    return {
      author: NAMES[Math.floor(r() * NAMES.length)],
      rating,
      title,
      body,
      date: new Date(Date.UTC(2026, 9, 6) - (i * 9 + Math.floor(r() * 9) + 2) * 864e5).toISOString(),
      verified: r() > 0.25,
    };
  });
}

export function ratingHistogram(p: Product) {
  const r = rng(`hist-${p.groupCode}`);
  const total = p.reviewCount;
  const five = Math.round(total * (0.45 + (p.rating - 4) * 0.3 + r() * 0.05));
  const four = Math.round(total * 0.28);
  const three = Math.round(total * 0.1);
  const two = Math.round(total * 0.04);
  const one = Math.max(0, total - five - four - three - two);
  return [five, four, three, two, one].map((c) => Math.max(0, c));
}
