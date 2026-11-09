'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { GitCompare, ShoppingBag, X } from 'lucide-react';
import { useStore } from '../Providers';
import { Price } from '../product/Price';
import { Rating } from '../product/Rating';
import { COMPARE_MAX, readCompare, toggleCompare } from '@/lib/compare';

interface CompareProduct {
  code: string;
  slug: string;
  title: string;
  brand: string;
  price: number;
  listPrice: number;
  discountRate: number;
  colorName: string;
  colorHex: string;
  material: string;
  spec: string | null;
  rating: number;
  reviewCount: number;
  categoryName: string;
  subcategoryName: string;
  sizes: Array<{ label: string; stock: number }>;
  image: string;
}

export function CompareTable() {
  const { quickAdd } = useStore();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [products, setProducts] = useState<CompareProduct[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  // localStorage is only readable after mount; the list is loaded once.
  useEffect(() => {
    const codes = readCompare();
    if (codes.length === 0) {
      setStatus('ready');
      return;
    }
    let cancelled = false;
    fetch(`/api/compare?codes=${encodeURIComponent(codes.join(','))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { products: CompareProduct[] }) => {
        if (cancelled) return;
        // Codes the catalogue no longer has are dropped from the stored list.
        for (const c of codes) if (!d.products.some((p) => p.code === c)) toggleCompare(c);
        // Keep the order the shopper added them in.
        setProducts(codes.map((c) => d.products.find((p) => p.code === c)).filter((p): p is CompareProduct => Boolean(p)));
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = (code: string) => {
    toggleCompare(code);
    setProducts((ps) => ps.filter((p) => p.code !== code));
  };

  const clearAll = () => {
    for (const p of products) toggleCompare(p.code);
    setProducts([]);
  };

  if (status === 'loading') {
    return (
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true" aria-label="Yükleniyor">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-sand" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card mt-10 p-8 text-center">
        <p className="font-display text-2xl">Liste yüklenemedi</p>
        <p className="mt-2 text-sm text-ink-soft">Bir sorun oluştu, lütfen sayfayı yenileyin.</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="card mt-10 flex flex-col items-center px-6 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sand text-ink-soft">
          <GitCompare size={24} strokeWidth={1.6} />
        </div>
        <p className="mt-5 font-display text-2xl">Karşılaştırma listeniz boş</p>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          Ürün sayfasında “Karşılaştır”a dokunarak en fazla {COMPARE_MAX} ürünü buraya ekleyin.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/c/kadin" className="btn-outline btn-sm">Kadın</Link>
          <Link href="/c/erkek" className="btn-outline btn-sm">Erkek</Link>
          <Link href="/c/ayakkabi" className="btn-outline btn-sm">Ayakkabı</Link>
          <Link href="/c/yeni-gelenler" className="btn-primary btn-sm">Yeni Gelenler</Link>
        </div>
      </div>
    );
  }

  const rows: Array<{ label: string; render: (p: CompareProduct) => ReactNode }> = [
    { label: 'Fiyat', render: (p) => <Price price={p.price} listPrice={p.listPrice} /> },
    { label: 'Değerlendirme', render: (p) => (p.reviewCount > 0 ? <Rating value={p.rating} count={p.reviewCount} /> : <span className="text-ink-muted">Henüz yok</span>) },
    { label: 'Kategori', render: (p) => `${p.categoryName} / ${p.subcategoryName}` },
    {
      label: 'Renk',
      render: (p) => (
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full border border-line-strong" style={{ backgroundColor: p.colorHex }} aria-hidden />
          {p.colorName}
        </span>
      ),
    },
    { label: 'Malzeme', render: (p) => p.material },
    { label: 'Ölçü / içerik', render: (p) => p.spec || <span className="text-ink-muted">—</span> },
    {
      label: 'Mevcut bedenler',
      render: (p) => {
        const avail = p.sizes.filter((s) => s.stock > 0);
        if (avail.length === 0) return <span className="text-sale">Tükendi</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {p.sizes.map((s) => (
              <span
                key={s.label}
                className={`rounded border px-1.5 py-0.5 text-2xs ${s.stock > 0 ? 'border-line-strong text-ink' : 'border-line text-ink-faint line-through'}`}
              >
                {s.label}
              </span>
            ))}
          </span>
        );
      },
    },
  ];

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center justify-between text-xs text-ink-muted">
        <span>
          {products.length} / {COMPARE_MAX} ürün
        </span>
        <button type="button" onClick={clearAll} className="link">
          Listeyi temizle
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <caption className="sr-only">Ürün karşılaştırma tablosu</caption>
          <colgroup>
            <col className="w-32 md:w-40" />
            {products.map((p) => (
              <col key={p.code} />
            ))}
          </colgroup>
          <thead>
            <tr className="align-top">
              <td className="border-b border-line p-4" />
              {products.map((p) => {
                const inStock = p.sizes.some((s) => s.stock > 0);
                return (
                  <th key={p.code} scope="col" className="relative border-b border-l border-line p-4 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => remove(p.code)}
                      aria-label={`${p.title} ürününü karşılaştırmadan çıkar`}
                      className="absolute right-6 top-6 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm hover:bg-white"
                    >
                      <X size={14} />
                    </button>
                    <Link href={`/p/${p.slug}`} className="block">
                      <img src={p.image} alt={p.title} className="aspect-[4/5] w-full rounded-xl bg-sand object-cover" />
                      <p lang="en" className="mt-3 text-2xs uppercase tracking-label text-ink-muted">{p.brand}</p>
                      <p className="mt-0.5 line-clamp-2 font-medium text-ink hover:underline">{p.title}</p>
                    </Link>
                    <button
                      type="button"
                      className="btn-primary btn-sm mt-3 w-full"
                      disabled={!inStock || adding === p.code}
                      onClick={async () => {
                        setAdding(p.code);
                        await quickAdd(p.code);
                        setAdding(null);
                      }}
                    >
                      <ShoppingBag size={14} /> {!inStock ? 'Tükendi' : adding === p.code ? 'Ekleniyor…' : 'Sepete Ekle'}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="align-top">
                <th scope="row" className="border-b border-line bg-paper/60 p-4 text-left text-2xs font-semibold uppercase tracking-label text-ink-muted">
                  {r.label}
                </th>
                {products.map((p) => (
                  <td key={p.code} className="border-b border-l border-line p-4 text-ink-soft">
                    {r.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {products.length < COMPARE_MAX && (
        <p className="mt-4 text-xs text-ink-muted">
          {COMPARE_MAX - products.length} ürün daha ekleyebilirsiniz. <Link href="/c/yeni-gelenler" className="link">Ürünlere göz atın</Link>
        </p>
      )}
    </div>
  );
}
