'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { formatPrice } from '@/lib/format';

export interface QuickAddProduct {
  code: string;
  title: string;
  slug: string;
  price: number;
  listPrice: number;
  image: string;
  sizes: Array<{ label: string; stock: number }>;
  /** Set when the ref named one size (`sizeCartCode`): no choice to ask for. */
  size?: string | null;
}

export function QuickAddModal({ product, onClose, onPick }: { product: QuickAddProduct; onClose: () => void; onPick: (size: string) => void }) {
  const [size, setSize] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-modal-top flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Beden seçin">
        <div className="flex items-start gap-4">
          <img src={product.image} alt="" className="h-28 w-[90px] rounded-lg object-cover" />
          <div className="flex-1">
            <p className="text-sm font-medium">{product.title}</p>
            <p className="mt-1 text-sm">
              {product.listPrice > product.price && <span className="mr-2 text-ink-faint line-through">{formatPrice(product.listPrice)}</span>}
              <span className={product.listPrice > product.price ? 'text-sale font-semibold' : 'font-semibold'}>{formatPrice(product.price)}</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="-mr-2 -mt-2 p-2 text-ink-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="eyebrow mt-6">Beden seçin</p>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {product.sizes.map((s) => (
            <button
              key={s.label}
              disabled={s.stock <= 0}
              onClick={() => setSize(s.label)}
              className={`h-11 rounded-lg border text-sm transition-colors disabled:cursor-not-allowed disabled:text-ink-faint disabled:line-through ${size === s.label ? 'border-ink bg-ink text-paper' : 'border-line-strong hover:border-ink'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button className="btn-primary mt-6 w-full" disabled={!size} onClick={() => size && onPick(size)}>
          Sepete Ekle
        </button>
      </div>
    </div>
  );
}
