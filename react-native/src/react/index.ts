/**
 * Optional React bindings.
 *
 * Imported from `@selwise/react-native/react` so the core SDK stays usable
 * without React on the import graph (services, sagas, redux middleware).
 *
 * These are hooks: they hand over data. The components that DRAW it — campaigns,
 * recommendation strips, search, product enrichment — are in
 * `@selwise/react-native/ui`, which needs `react-native`; this entry does not.
 */
export { useSelwise, useOptionalSelwise, useSelwiseHost, SelwiseProvider, type SelwiseProviderProps } from './context.js';
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
} from './host.js';
export {
  useCartVersion,
  useLocale,
  useProduct,
  useScreen,
  useSelwiseReady,
  useThemeVersion,
} from './use-selwise-state.js';
export { useRecommendationWidget } from './use-recommendation-widget.js';
export {
  useSelwiseSearch,
  type SearchCategoryChip,
  type UseSelwiseSearchOptions,
  type UseSelwiseSearchResult,
} from './use-selwise-search.js';
