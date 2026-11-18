import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SelwiseProduct } from '@selwise/react-native';

/**
 * The app's navigation: four tabs and a product page on top. A real app has a
 * router; what matters to Selwise is only that the app can answer "open this
 * screen" when a campaign button, a notification or a strip asks.
 */
export type Tab = 'home' | 'search' | 'cart' | 'account';

/** The screen addresses Selwise uses (`app://basket`) and the paths a campaign button may carry (`/cart`). */
const LINKS: Record<string, Tab> = {
  'app://home': 'home',
  'app://search': 'search',
  'app://basket': 'cart',
  'app://account': 'account',
  '/': 'home',
  '/search': 'search',
  '/cart': 'cart',
  '/account': 'account',
};

/** The tab a link stands for, or null when it is not one of this app's screens. */
export function tabOfLink(url: string): Tab | null {
  const clean = url.trim().replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '');
  return LINKS[url.trim().toLowerCase()] ?? LINKS[clean.replace(/(.)\/+$/, '$1')] ?? null;
}

interface NavigationValue {
  tab: Tab;
  product: SelwiseProduct | null;
  goTo: (tab: Tab) => void;
  openProduct: (product: SelwiseProduct) => void;
  back: () => void;
  /** Opens a link if it is one of this app's screens; false hands it back to the SDK (it opens https links in the browser). */
  openLink: (url: string) => boolean;
}

const NavigationContext = createContext<NavigationValue | null>(null);

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation outside NavigationProvider');
  return value;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('home');
  const [product, setProduct] = useState<SelwiseProduct | null>(null);

  const goTo = useCallback((next: Tab) => {
    setProduct(null);
    setTab(next);
  }, []);
  const openLink = useCallback(
    (url: string) => {
      const target = tabOfLink(url);
      if (!target) return false;
      goTo(target);
      return true;
    },
    [goTo],
  );

  const value = useMemo<NavigationValue>(
    () => ({ tab, product, goTo, openProduct: setProduct, back: () => setProduct(null), openLink }),
    [tab, product, goTo, openLink],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
