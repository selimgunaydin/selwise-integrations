/**
 * The components that draw what the dashboard configures in a React Native app:
 * campaigns and widgets, recommendation strips, named points on a screen,
 * search (a whole screen, or its results list) and product enrichment.
 *
 * Imported from `@selwise/react-native/ui`, which needs `react-native` — the
 * core entry and `@selwise/react-native/react` do not. Mount them inside
 * `<SelwiseProvider client={...} host={...}>`; what the SDK cannot know about
 * the app (how to open a link, how to add to its basket, a WebView) is the
 * `host`'s, and every member of it is optional.
 *
 * ```tsx
 * import { Selwise } from '@selwise/react-native';
 * import { SelwiseProvider } from '@selwise/react-native/react';
 * import { SelwiseSurfaces, SelwiseSlot } from '@selwise/react-native/ui';
 *
 * <SelwiseProvider client={selwise} host={{ navigate, addToCart, WebView }}>
 *   <App />
 *   <SelwiseSurfaces />   // once, at the root: every campaign follows the screen
 * </SelwiseProvider>
 *
 * <SelwiseSlot screen="app://home" slot="home-bottom" />   // wherever a strip may go
 * ```
 *
 * What the merchant designs for a recommendation is drawn here: the strip's
 * heading and container, every display type (slider, grid, list, tabs by role, a
 * look with its total and "add all"), and the product card from the card
 * designer — drawn from its element tree, painted from the brand, adding to the
 * app's basket through `host.addToCart`. `renderItem` on the strips and on search,
 * and `renderers` on the surfaces overlay, are where an app draws with its own
 * components instead.
 */

export { SelwiseProvider, useSelwise, useOptionalSelwise, useSelwiseHost, type SelwiseProviderProps } from '../react/context.js';
export type {
  SelwiseCartItem,
  SelwiseCartResult,
  SelwiseHost,
  SelwiseIconProps,
  SelwiseImageProps,
  SelwiseNavigationKind,
  SelwiseNavigationSource,
  SelwiseNavigationTarget,
  SelwiseSafeAreaInsets,
  SelwiseWishlistRequest,
  SelwiseWishlistResult,
} from '../react/host.js';

export { SelwiseSurfaces, type SelwiseSurfacesProps, type SurfaceRenderer } from './SelwiseSurfaces.js';
export type { SurfaceRendererProps } from './surfaces/index.js';
export {
  RecommendationStrip,
  RecommendationStrips,
  DefaultCard,
  formatPrice,
  type RecommendationStripProps,
  type RecommendationStripsProps,
  type RenderItemInfo,
  type StripFrameProps,
} from './RecommendationStrip.js';
export { ProductCard, type ProductCardProps } from './card/ProductCard.js';
export type { CardActions, CardEnv, WishlistActions } from './card/card-env.js';
export { VariantSheet, type VariantSheetProps } from './card/VariantSheet.js';
export { formatMoney } from './price-format.js';
export { SelwiseSlot, type SelwiseSlotProps } from './SelwiseSlot.js';
export { SelwiseDebugOverlay } from './SelwiseDebugOverlay.js';
export { isTurkishLocale } from './strings.js';
export { SelwiseSearch, ResultRow, type SelwiseSearchProps } from './SelwiseSearch.js';
export {
  SelwiseSearchPanel,
  type RenderSearchEmptyInfo,
  type RenderSearchItemInfo,
  type SearchInputRenderProps,
  type SelwiseSearchPanelProps,
} from './SelwiseSearchPanel.js';
export { SearchResultItem, formatSearchPrice, type SearchCartState, type SearchResultItemProps } from './search-result-item.js';
export type { RenderSuggestionInfo, SuggestionValue } from './search-suggestions-view.js';
export { searchTheme, type SearchTheme } from './search-styles.js';
export { SelwiseEnrichment, type SelwiseEnrichmentProps } from './SelwiseEnrichment.js';
export { classifyLink, useNavigate, type NavigationRequest } from './host-hooks.js';

// The individual renderers, for an app that wants one surface type in its own
// layout rather than the whole overlay.
// Namespaces are imported and re-exported in two statements, never
// `export * as name from`: React Native's Babel preset does not transform that
// syntax, and an app's Metro build would refuse this file.
import * as renderers from './surfaces/index.js';
export { renderers };
// The CSS-to-RN translation, for an app writing its own renderer against a
// merchant's `stylesJson`.
import * as styleUtils from './styles.js';
export { styleUtils };
import * as triggerUtils from './triggers.js';
export { triggerUtils };
import * as countdownUtils from './countdown.js';
export { countdownUtils };
// The points an app can mount, per screen address: `slotUtils.SCREEN_SLOTS`.
import * as slotUtils from './slots.js';
export { slotUtils };
// How a strip lays its cards out, for the dashboard's preview to draw a card at the width the app does: `stripLayout.cardWidth`, `DEFAULT_PHONE_COLUMNS`.
import * as stripLayout from './strip-layout.js';
export { stripLayout };
// Where a campaign is drawn (dock, corner, window, point): `placementUtils.layoutOf(surface)`.
import * as placementUtils from './placement.js';
export { placementUtils };
// The document assembler, for an app rendering enrichment in its own WebView.
import * as enrichmentUtils from './enrichment-document.js';
export { enrichmentUtils };
// The names a drawn part carries (`testID`), so a UI test or the dashboard's preview can say which part was touched.
import * as pickIds from './pick-ids.js';
export { pickIds };
