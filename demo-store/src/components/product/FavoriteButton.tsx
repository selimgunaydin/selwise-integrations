'use client';

import { Heart } from 'lucide-react';
import { useStore } from '../Providers';

export function FavoriteButton({ code, price, className = '', withLabel = false }: { code: string; price: number; className?: string; withLabel?: boolean }) {
  const { favorites, toggleFavorite } = useStore();
  const active = favorites.includes(code);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggleFavorite(code, price);
      }}
      aria-pressed={active}
      aria-label={active ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      className={className}
    >
      <Heart size={withLabel ? 18 : 17} className={active ? 'fill-sale text-sale' : ''} strokeWidth={1.6} />
      {withLabel && <span>{active ? 'Favorilerde' : 'Favorilere Ekle'}</span>}
    </button>
  );
}
