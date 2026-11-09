'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Heart, ShoppingBag, X } from 'lucide-react';
import { useStore } from '../Providers';
import { Price } from '../product/Price';
import { ListTracker } from '../product/ListTracker';
import { EmptyState } from './AccountHeading';

export interface FavoriteItem {
  code: string;
  slug: string;
  title: string;
  brand: string;
  colorName: string;
  price: number;
  listPrice: number;
  discountRate: number;
  stock: number;
}

/**
 * The list comes from the server; what the shopper removes here disappears at
 * once because the grid follows the store context's favourites.
 */
export function FavoritesGrid({ items }: { items: FavoriteItem[] }) {
  const { favorites, toggleFavorite, quickAdd } = useStore();
  const [adding, setAdding] = useState<string | null>(null);
  const visible = items.filter((p) => favorites.includes(p.code));

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={<Heart size={24} strokeWidth={1.6} />}
        title="Favori listeniz boş"
        text="Ürün kartlarındaki kalp simgesine dokunarak beğendiğiniz ürünleri buraya ekleyebilirsiniz."
        action={<Link href="/c/yeni-gelenler" className="btn-primary">Yeni Gelenleri Keşfet</Link>}
      />
    );
  }

  return (
    <div>
      <p className="mb-4 text-xs text-ink-muted">{visible.length} ürün</p>
      <ListTracker className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((p, i) => (
          <div key={p.code} className="group relative flex flex-col" data-ardisa-card={p.code} data-list="favorites" data-position={i + 1} data-price={p.price}>
            <Link href={`/p/${p.slug}`} className="block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-sand">
                <img src={`/img/p/${p.code}/1.svg`} alt={p.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                {p.discountRate > 0 && (
                  <span className="absolute left-3 top-3 rounded-full bg-sale px-2.5 py-1 text-2xs font-semibold text-white">%{p.discountRate}</span>
                )}
                {p.stock === 0 && (
                  <span className="absolute inset-x-3 bottom-3 rounded-lg bg-white/90 py-2 text-center text-xs font-medium text-ink-soft">Tükendi</span>
                )}
                {p.stock > 0 && p.stock <= 3 && (
                  <span className="absolute inset-x-3 bottom-3 rounded-lg bg-white/90 py-2 text-center text-xs font-medium text-warn">Son {p.stock} ürün</span>
                )}
              </div>
              <div className="mt-3 space-y-1">
                <p lang="en" className="text-2xs uppercase tracking-label text-ink-muted">{p.brand}</p>
                <h3 className="line-clamp-1 text-sm text-ink">{p.title}</h3>
                <Price price={p.price} listPrice={p.listPrice} />
              </div>
            </Link>
            <button
              type="button"
              onClick={() => void toggleFavorite(p.code, p.price)}
              aria-label={`${p.title} ürününü favorilerden çıkar`}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink transition hover:bg-white"
            >
              <X size={16} />
            </button>
            <button
              type="button"
              className="btn-outline btn-sm mt-3 w-full"
              disabled={p.stock === 0 || adding === p.code}
              onClick={async () => {
                setAdding(p.code);
                await quickAdd(p.code);
                setAdding(null);
              }}
            >
              <ShoppingBag size={14} />
              {p.stock === 0 ? 'Stokta yok' : adding === p.code ? 'Ekleniyor…' : 'Sepete Ekle'}
            </button>
          </div>
        ))}
      </ListTracker>
    </div>
  );
}
