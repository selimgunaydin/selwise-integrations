import type { Metadata } from 'next';
import { CompareTable } from '@/components/content/CompareTable';

export const metadata: Metadata = { title: 'Ürün Karşılaştırma' };

export default function ComparePage() {
  return (
    <div className="container py-10 md:py-16" id="compare">
      <p className="eyebrow">Karşılaştırma listem</p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">Ürünleri karşılaştırın</h1>
      <p className="mt-3 max-w-xl text-sm text-ink-soft">
        Ürün sayfalarındaki “Karşılaştır” bağlantısıyla en fazla 4 ürünü yan yana inceleyebilirsiniz. Listeniz bu tarayıcıda saklanır.
      </p>
      <CompareTable />
    </div>
  );
}
