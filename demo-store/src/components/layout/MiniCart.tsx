'use client';

import Link from 'next/link';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../Providers';
import { formatPrice } from '@/lib/format';
import { FreeShippingBar } from '../cart/FreeShippingBar';

export function MiniCart() {
  const { cart, miniCartOpen, setMiniCartOpen, setQty, removeLine, busy } = useStore();
  useEffect(() => {
    if (!miniCartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMiniCartOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [miniCartOpen, setMiniCartOpen]);
  if (!miniCartOpen) return null;
  // Portalled to <body>: the header that mounts this has `backdrop-blur`, and a
  // backdrop-filter makes an element the containing block of its fixed
  // descendants — `fixed inset-0` would cover the header, not the viewport.
  return createPortal(
    <div className="fixed inset-0 z-drawer bg-ink/40 animate-fade-in" onClick={() => setMiniCartOpen(false)}>
      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-drawer animate-slide-in"
        onClick={(e) => e.stopPropagation()}
        aria-label="Sepetim"
        id="mini-cart"
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <p className="font-display text-xl">Sepetim <span className="text-sm text-ink-muted">({cart.itemCount})</span></p>
          <button onClick={() => setMiniCartOpen(false)} className="-mr-2 p-2" aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        {cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="font-display text-2xl">Sepetiniz boş</p>
            <p className="text-sm text-ink-muted">Beğendiğiniz ürünleri sepete ekleyerek alışverişe başlayın.</p>
            <Link href="/c/yeni-gelenler" onClick={() => setMiniCartOpen(false)} className="btn-primary">
              Yeni Gelenleri Keşfet
            </Link>
          </div>
        ) : (
          <>
            <div className="border-b border-line px-5 py-4">
              <FreeShippingBar remaining={cart.freeShippingRemaining} free={cart.freeShipping} />
            </div>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {cart.lines.map((l) => (
                <li key={`${l.code}-${l.size}`} className="flex gap-4 py-4">
                  <Link href={`/p/${l.slug}`} onClick={() => setMiniCartOpen(false)} className="shrink-0">
                    <img src={l.image} alt="" className="h-28 w-[90px] rounded-lg object-cover" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate text-sm font-medium">{l.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">Beden: {l.size}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex h-9 items-center rounded-full border border-line-strong">
                        <button disabled={busy} onClick={() => setQty(l, l.qty - 1)} className="px-2.5" aria-label="Azalt">
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center text-sm">{l.qty}</span>
                        <button disabled={busy || l.qty >= l.maxQty} onClick={() => setQty(l, l.qty + 1)} className="px-2.5 disabled:opacity-30" aria-label="Artır">
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="text-right">
                        {l.listPrice > l.price && <p className="text-2xs text-ink-faint line-through">{formatPrice(l.listPrice * l.qty)}</p>}
                        <p className={`text-sm font-semibold ${l.listPrice > l.price ? 'text-sale' : ''}`}>{formatPrice(l.lineTotal)}</p>
                      </div>
                    </div>
                  </div>
                  <button disabled={busy} onClick={() => removeLine(l)} className="self-start p-1 text-ink-faint hover:text-ink" aria-label="Kaldır">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="space-y-3 border-t border-line p-5">
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Ara toplam</span>
                <span className="font-semibold">{formatPrice(cart.subtotal)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/cart" onClick={() => setMiniCartOpen(false)} className="btn-outline">
                  Sepete Git
                </Link>
                <Link href="/checkout/shipping" onClick={() => setMiniCartOpen(false)} className="btn-primary">
                  Satın Al
                </Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
