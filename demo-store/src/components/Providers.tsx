'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CartLine, CartView } from '@/lib/store/cart';
import type { PublicUser } from '@/lib/store/auth';
import * as selwise from '@/lib/selwise/client';
import { QuickAddModal, type QuickAddProduct } from './product/QuickAddModal';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

interface StoreContextValue {
  user: PublicUser | null;
  cart: CartView;
  favorites: string[];
  busy: boolean;
  miniCartOpen: boolean;
  setMiniCartOpen: (open: boolean) => void;
  addToCart: (code: string, size: string, qty?: number, opts?: { openMiniCart?: boolean }) => Promise<boolean>;
  quickAdd: (ref: string, qty?: number) => Promise<boolean>;
  setQty: (line: CartLine, qty: number) => Promise<void>;
  removeLine: (line: CartLine) => Promise<void>;
  applyCoupon: (code: string | null) => Promise<string | null>;
  setGift: (wrap: boolean, note: string | null) => Promise<void>;
  toggleFavorite: (code: string, price: number) => Promise<void>;
  setUser: (u: PublicUser | null) => void;
  refresh: () => Promise<void>;
  toast: (text: string, tone?: 'ok' | 'error') => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

async function cartCall(body: Record<string, unknown>) {
  const res = await fetch('/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'İşlem tamamlanamadı.');
  return data as { cart: CartView; line?: CartLine };
}

export function StoreProvider({
  initialUser,
  initialCart,
  initialFavorites,
  children,
}: {
  initialUser: PublicUser | null;
  initialCart: CartView;
  initialFavorites: string[];
  children: ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  const [cart, setCart] = useState(initialCart);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [busy, setBusy] = useState(false);
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [quick, setQuick] = useState<{ product: QuickAddProduct; qty: number; resolve: (ok: boolean) => void } | null>(null);
  const cartRef = useRef(cart);
  cartRef.current = cart;

  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/session', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setUser(data.user);
    setCart(data.cart);
    setFavorites(data.favorites);
  }, []);

  const addToCart = useCallback<StoreContextValue['addToCart']>(
    async (code, size, qty = 1, opts) => {
      setBusy(true);
      try {
        const { cart: next, line } = await cartCall({ action: 'add', code, size, qty });
        setCart(next);
        if (line) selwise.basketEvent('add', { ...line, delta: qty }, next);
        if (opts?.openMiniCart !== false) setMiniCartOpen(true);
        return true;
      } catch (e) {
        toast((e as Error).message, 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  /**
   * Add by any reference (item code, cart code, slug or one size's own code).
   * A product with more than one size asks for it first — exactly what a
   * recommendation card's "add to cart" lands on for a garment whose card
   * offers no size chooser; a card that does sends the size's code.
   */
  const quickAdd = useCallback<StoreContextValue['quickAdd']>(
    async (ref, qty = 1) => {
      const res = await fetch(`/api/products/${encodeURIComponent(ref)}`);
      if (!res.ok) {
        toast('Ürün bulunamadı.', 'error');
        return false;
      }
      const product = (await res.json()) as QuickAddProduct;
      const available = product.sizes.filter((s) => s.stock > 0);
      if (available.length === 0) {
        toast('Bu ürün şu anda stokta yok.', 'error');
        return false;
      }
      // A Selwise card that offered sizes sends the chosen one's own code.
      if (product.size) {
        if (!available.some((s) => s.label === product.size)) {
          toast('Bu beden şu anda stokta yok.', 'error');
          return false;
        }
        return addToCart(product.code, product.size, qty);
      }
      if (product.sizes.length === 1) return addToCart(product.code, product.sizes[0].label, qty);
      return new Promise<boolean>((resolve) => setQuick({ product, qty, resolve }));
    },
    [addToCart, toast],
  );

  const setQty = useCallback<StoreContextValue['setQty']>(
    async (line, qty) => {
      setBusy(true);
      try {
        const { cart: next } = await cartCall({ action: 'qty', code: line.code, size: line.size, qty });
        setCart(next);
        const delta = qty - line.qty;
        if (delta > 0) selwise.basketEvent('add', { ...line, qty, delta }, next);
        else if (delta < 0) selwise.basketEvent('remove', { ...line, qty, delta: -delta }, next);
      } catch (e) {
        toast((e as Error).message, 'error');
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const removeLine = useCallback<StoreContextValue['removeLine']>(
    async (line) => {
      setBusy(true);
      try {
        const { cart: next } = await cartCall({ action: 'remove', code: line.code, size: line.size });
        setCart(next);
        selwise.basketEvent('remove', { ...line, delta: line.qty }, next);
      } catch (e) {
        toast((e as Error).message, 'error');
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const applyCoupon = useCallback<StoreContextValue['applyCoupon']>(async (code) => {
    try {
      const { cart: next } = await cartCall({ action: 'coupon', code });
      setCart(next);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);

  const setGift = useCallback<StoreContextValue['setGift']>(async (wrap, note) => {
    const { cart: next } = await cartCall({ action: 'gift', wrap, note });
    setCart(next);
  }, []);

  const toggleFavorite = useCallback<StoreContextValue['toggleFavorite']>(
    async (code, price) => {
      if (!user) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}&reason=favorite`;
        return;
      }
      const isFav = favorites.includes(code);
      setFavorites((f) => (isFav ? f.filter((c) => c !== code) : [...f, code]));
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, action: isFav ? 'remove' : 'add' }),
      });
      if (!res.ok) {
        setFavorites((f) => (isFav ? [...f, code] : f.filter((c) => c !== code)));
        toast('Favoriler güncellenemedi.', 'error');
        return;
      }
      selwise.wishlist(code, isFav ? 'remove' : 'add', price);
      toast(isFav ? 'Favorilerden çıkarıldı.' : 'Favorilere eklendi.');
    },
    [favorites, user, toast],
  );

  // The bridge Selwise's "add to cart" buttons call (cart platform `custom`):
  //   window.ArdisaCart.add(product.variantId || productItemCode, quantity)
  // and the quick-view event its cards and search results raise.
  useEffect(() => {
    window.ArdisaCart = {
      add: (ref, qty = 1, size) => (size ? addToCart(ref, size, qty) : quickAdd(ref, qty)),
      open: () => setMiniCartOpen(true),
    };
    const onQuickView = (e: Event) => {
      const detail = (e as CustomEvent).detail as { product?: { url?: string; productItemCode?: string; itemCode?: string } };
      const url = detail?.product?.url;
      if (url) window.location.href = url;
      else if (detail?.product?.productItemCode || detail?.product?.itemCode) {
        void quickAdd(String(detail.product.productItemCode || detail.product.itemCode));
      }
    };
    window.addEventListener('selwise:quick-view', onQuickView);
    return () => window.removeEventListener('selwise:quick-view', onQuickView);
  }, [addToCart, quickAdd]);

  const value = useMemo<StoreContextValue>(
    () => ({
      user,
      cart,
      favorites,
      busy,
      miniCartOpen,
      setMiniCartOpen,
      addToCart,
      quickAdd,
      setQty,
      removeLine,
      applyCoupon,
      setGift,
      toggleFavorite,
      setUser,
      refresh,
      toast,
    }),
    [user, cart, favorites, busy, miniCartOpen, addToCart, quickAdd, setQty, removeLine, applyCoupon, setGift, toggleFavorite, refresh, toast],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      {quick && (
        <QuickAddModal
          product={quick.product}
          onClose={() => {
            quick.resolve(false);
            setQuick(null);
          }}
          onPick={async (size) => {
            const ok = await addToCart(quick.product.code, size, quick.qty);
            quick.resolve(ok);
            setQuick(null);
          }}
        />
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-toast flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-fade-in rounded-full px-5 py-3 text-sm shadow-pop ${t.tone === 'ok' ? 'bg-ink text-paper' : 'bg-sale text-white'}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
}
