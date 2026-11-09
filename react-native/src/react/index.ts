/**
 * Optional React bindings.
 *
 * Imported from `@selwise/react-native/react` so the core SDK stays usable
 * without React on the import graph (services, sagas, redux middleware).
 *
 * There are deliberately NO UI components here. The Akinon Appmaker apps
 * already own themed product cards, sliders and list screens under
 * `src/components` and `src/themeConfigs`; a Selwise-branded card would look
 * foreign next to them and would have to re-implement every theme. These hooks
 * hand over data and let the app render it with the components it already has.
 */
export { useSelwise, SelwiseProvider } from './context.js';
export { useRecommendationWidget } from './use-recommendation-widget.js';
export { useSelwiseSearch } from './use-selwise-search.js';
