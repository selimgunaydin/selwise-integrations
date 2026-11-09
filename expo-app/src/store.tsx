import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SelwiseProduct } from '@selwise/react-native';
import { CURRENCY, selwise, STORE_URL } from './selwise';

/**
 * The app's own basket and session. The basket lives in the APP; Selwise is
 * told what is in it (`setCart`, absolute — never a delta) on every change,
 * which is what goal bars, cart targeting and "complete to free shipping"
 * strips read.
 */
export interface CartLine {
  product: SelwiseProduct;
  qty: number;
}

export interface Customer {
  selwiseId: string;
  email: string;
  firstName: string;
  /** The store server's signature of `selwiseId` — null when it has no identity secret. */
  selwiseSignature: { userHash: string; userHashTs: number } | null;
}

interface StoreValue {
  lines: CartLine[];
  total: number;
  itemCount: number;
  add: (product: SelwiseProduct) => void;
  remove: (itemCode: string) => void;
  clear: () => void;
  customer: Customer | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  open: SelwiseProduct | null;
  setOpen: (p: SelwiseProduct | null) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore() {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}

/** The basket's worth (after discounts, before shipping) and its units — what the screen shows and what Selwise is told. */
function summarize(lines: CartLine[]) {
  return {
    total: Math.round(lines.reduce((s, l) => s + l.product.price * l.qty, 0) * 100) / 100,
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
  };
}

function report(lines: CartLine[]) {
  selwise.setCart({ ...summarize(lines), currency: CURRENCY, codes: lines.map((l) => l.product.itemCode) });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [open, setOpen] = useState<SelwiseProduct | null>(null);

  const add = useCallback((product: SelwiseProduct) => {
    setLines((prev) => {
      const found = prev.find((l) => l.product.itemCode === product.itemCode);
      const next = found ? prev.map((l) => (l === found ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { product, qty: 1 }];
      report(next);
      return next;
    });
    selwise.trackAddToCart(product.itemCode, { quantity: 1, price: product.price, currency: product.currency || CURRENCY });
  }, []);

  const remove = useCallback((itemCode: string) => {
    setLines((prev) => {
      const next = prev.filter((l) => l.product.itemCode !== itemCode);
      report(next);
      return next;
    });
    selwise.trackRemoveFromCart(itemCode);
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    // After an order the basket is not "empty and known" for long; say nothing rather than a stale amount.
    selwise.setCart(null);
  }, []);

  /**
   * Sign-in against the app's backend — here the Ardisa demo store, whose
   * /api/auth/login answers with the customer AND the server's signature of
   * the customer id (HMAC with the channel's identity secret). The secret
   * never reaches the app; only the signature does.
   */
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${STORE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { user?: Customer; error?: string };
      if (!res.ok || !body.user) return body.error || `Giriş başarısız (HTTP ${res.status})`;
      const u = body.user;
      await selwise.identify(u.selwiseId, { email: u.email, firstName: u.firstName }, u.selwiseSignature ?? undefined);
      setCustomer(u);
      return null;
    } catch (e) {
      return `Mağazaya ulaşılamadı: ${(e as Error).message}`;
    }
  }, []);

  const signOut = useCallback(async () => {
    await selwise.logout(); // the visitor is kept, the session rotates
    setCustomer(null);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      lines,
      ...summarize(lines),
      add,
      remove,
      clear,
      customer,
      signIn,
      signOut,
      open,
      setOpen,
    }),
    [lines, add, remove, clear, customer, signIn, signOut, open],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
