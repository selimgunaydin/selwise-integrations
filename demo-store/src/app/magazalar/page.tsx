import type { Metadata } from 'next';
import { STORES } from '@/lib/content/stores';
import { StoreLocator } from '@/components/content/StoreLocator';

export const metadata: Metadata = {
  title: 'Mağazalarımız',
  description: 'Size en yakın Ardisa mağazasını bulun: adres, çalışma saatleri ve mağaza hizmetleri.',
};

export default function StoresPage() {
  const cities = new Set(STORES.map((s) => s.city)).size;
  return (
    <div className="container py-10 md:py-16" id="stores">
      <div className="max-w-2xl">
        <p className="eyebrow">Mağazalarımız</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">
          {cities} şehirde {STORES.length} mağaza
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Online siparişlerinizi işaretli mağazalarımızdan ücretsiz teslim alabilir, tüm mağazalarımızda iade ve değişim yapabilirsiniz.
        </p>
      </div>
      <StoreLocator stores={STORES} />
      <p className="mt-10 text-xs text-ink-faint">Mağaza adları, adresleri ve telefon numaraları kurgusaldır; Ardisa, Selwise’ın demo mağazasıdır.</p>
    </div>
  );
}
