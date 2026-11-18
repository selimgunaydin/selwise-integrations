import { useMemo, type ReactNode } from 'react';
import { WebView } from 'react-native-webview';
import { SelwiseProvider, type SelwiseHost } from '@selwise/react-native/ui';
import { favourites } from './favourites';
import { useNavigation } from './navigation';
import { STORE_URL, selwise } from './selwise';
import { useStore } from './store';

/**
 * Everything Selwise's components cannot know about THIS app, handed over once.
 * Every member is optional; each one that is missing makes its feature fall back
 * to something plain or say in the log what it lacked.
 *
 * - `navigate`: a campaign button, a strip card or a notification asks the app
 *   to open a link. Return false for one that is not yours and the SDK opens an
 *   https link in the browser.
 * - `addToCart`: the app's own basket — the one its own buttons fill.
 * - `WebView`: a merchant's custom campaign and a product enrichment block are
 *   their own HTML and run in one.
 * - `safeAreaInsets`: the root view already keeps clear of the notch, so the
 *   overlay adds nothing. An app whose overlay spans the whole screen passes
 *   `useSafeAreaInsets` from react-native-safe-area-context instead.
 * - `toggleWishlist`, `isWishlisted`, `subscribeWishlist`: the app's favourites.
 *   A product card the merchant designed with a favourite button draws it only
 *   when these are given.
 *
 * The host is built once: a new object on every render would redraw every
 * Selwise component below it.
 */
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

export function ArdisaSelwiseProvider({ children }: { children: ReactNode }) {
  const { add } = useStore();
  const { openLink } = useNavigation();

  const host = useMemo<SelwiseHost>(
    () => ({
      navigate: (target) => openLink(target.url),
      addToCart: ({ product, quantity }) => {
        if (!product) return { success: false };
        // The strip or the search panel reports the add itself, with what asked
        // for it — reporting it here too would count one tap twice.
        add(product, quantity, { report: false });
        return { success: true };
      },
      WebView,
      safeAreaInsets: NO_INSETS,
      storefrontUrl: STORE_URL,
      toggleWishlist: ({ product, wished }) => {
        favourites.set(product.itemCode, wished);
        return { success: true };
      },
      isWishlisted: (code) => favourites.has(code),
      subscribeWishlist: favourites.subscribe,
    }),
    [add, openLink],
  );

  return (
    <SelwiseProvider client={selwise} host={host}>
      {children}
    </SelwiseProvider>
  );
}
