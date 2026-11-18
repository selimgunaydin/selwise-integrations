'use strict';

/**
 * `SelwiseSearchScreen`: the merchant's whole search as an App Maker screen.
 *
 * An App Maker plugin cannot register a screen of its own (its install manifest
 * only declares dependencies), so the screen is a component the app's router
 * points a route at. It takes what every route component takes, `{ navigation,
 * route }`, and nothing else is needed:
 *
 * ```js
 * // the app's router: screens map
 * Search: SelwiseSearchScreen,
 * ```
 *
 * What it does, so the app does not have to:
 *
 * - a back arrow that calls `navigation.goBack()`, left out when there is
 *   nothing to go back to;
 * - the input, focused as the screen opens, starting from `route.params.query`
 *   when a link or a button names a term;
 * - the status bar and the home indicator kept clear;
 * - the suggestions, results, categories, texts, look and add to the basket the
 *   merchant set in the dashboard (Search), through this plugin's host: a result
 *   opens through the app's deep-link map, the basket is the app's own;
 * It does NOT tell Selwise which screen the visitor is on: the plugin does, from
 * the app's own navigation, and any route registered for `app://search` in the
 * `screenRoutes` config is read as the search page there (`integration/screens.js`).
 *
 * It uses the `SelwiseProvider` the app already mounted above it, so the app's
 * `host` (its own `navigate`, insets, theme) is not shadowed, and mounts the
 * plugin's own provider only when there is none. While search is switched off
 * for the visitor, or the plugin has no configuration, it draws a short sentence
 * and the back arrow rather than a blank screen.
 *
 * Any other prop is the panel's own (`onProductPress`, `renderItem`,
 * `addToCartLabel`, `unstyled`, ...): a screen that wraps this one may pass them.
 */

const React = require('react');
const { View, Text, Pressable } = require('react-native');
const sdk = require('@selwise/react-native/ui');
const plugin = require('../integration/index.js');
const { hostOf } = require('./host.js');
const { SelwiseProvider } = require('./provider.js');

const h = React.createElement;

/** The language the screen's two sentences are in: the configured one, else the device's. */
function localeOf() {
  const configured = plugin.config && typeof plugin.config.locale === 'string' ? plugin.config.locale.trim() : '';
  if (configured) return configured;
  try {
    return String(Intl.DateTimeFormat().resolvedOptions().locale || '');
  } catch (error) {
    return '';
  }
}

/** The two sentences the screen says itself; every other word is the merchant's (Search → Texts). */
function words() {
  return sdk.isTurkishLocale(localeOf())
    ? { back: 'Geri', unavailable: 'Arama şu anda kullanılamıyor.' }
    : { back: 'Back', unavailable: 'Search is not available right now.' };
}

const noInsets = () => ({ top: 0, bottom: 0 });

/** The app's safe-area hook, or one that answers nothing: a hook is called on every render or on none. */
function insetsHook() {
  const own = hostOf(plugin).safeAreaInsets;
  return typeof own === 'function' ? own : noInsets;
}

function initialQueryOf(route) {
  const params = route && route.params;
  return params && typeof params.query === 'string' && params.query.trim() ? params.query : undefined;
}

/** Whether there is a screen to go back to: React Navigation says, and a navigator that does not is assumed to. */
function backHandler(navigation) {
  if (!navigation || typeof navigation.goBack !== 'function') return undefined;
  if (typeof navigation.canGoBack === 'function' && !navigation.canGoBack()) return undefined;
  return () => navigation.goBack();
}

/** The sentence that stands where the panel has nothing to draw: search off, or no configuration. */
function Unavailable() {
  return h(
    View,
    { style: { flex: 1, padding: 32, alignItems: 'center' } },
    h(Text, { accessibilityRole: 'alert', style: { fontSize: 14, color: '#6b7280', textAlign: 'center' } }, words().unavailable)
  );
}

/**
 * The whole screen when there is no client at all: a back arrow and the sentence,
 * clear of the status bar. It cannot be the SDK's panel, which needs a client
 * and a provider to draw even its own back bar, and here there is neither.
 */
function Idle(props) {
  const useInsets = React.useMemo(insetsHook, []);
  let insets = noInsets();
  try {
    insets = useInsets() || insets;
  } catch (error) {
    insets = noInsets();
  }
  return h(
    View,
    { style: { flex: 1, backgroundColor: '#ffffff', paddingTop: insets.top, paddingBottom: insets.bottom } },
    props.onBack
      ? h(
          Pressable,
          {
            onPress: props.onBack,
            accessibilityRole: 'button',
            accessibilityLabel: words().back,
            hitSlop: 8,
            style: { height: 48, paddingHorizontal: 16, justifyContent: 'center' },
          },
          h(Text, { style: { fontSize: 30, lineHeight: 32, color: '#111827' } }, '\u2039')
        )
      : null,
    h(Unavailable)
  );
}

function SelwiseSearchScreen(props) {
  const { navigation, route, ...panelProps } = props || {};
  const [status, setStatus] = React.useState(null);
  // The provider the app mounted above this screen, if any (a hook: read on every render).
  const ambient = sdk.useOptionalSelwise();

  const onBack = backHandler(navigation);
  const own = panelProps.onUnavailable;
  const onUnavailable = React.useCallback(
    (next) => {
      setStatus(next);
      if (typeof own === 'function') own(next);
    },
    [own]
  );

  // No client anywhere: the plugin has no configuration, so there is no search to draw.
  if (!ambient && !plugin.selwise) return h(Idle, { onBack: onBack });

  const panel = h(sdk.SelwiseSearchPanel, {
    autoFocus: true,
    ...panelProps,
    safeArea: true,
    onBack: onBack,
    backLabel: words().back,
    initialQuery: initialQueryOf(route),
    onUnavailable: onUnavailable,
    // Off, the panel draws only its back bar and the sentence takes the rest.
    style: [{ flex: status ? 0 : 1 }, panelProps.style],
  });

  const frame = h(View, { style: { flex: 1, backgroundColor: '#ffffff' } }, panel, status ? h(Unavailable) : null);
  // The app's own provider is used as it is; the plugin's is only the fallback.
  return ambient ? frame : h(SelwiseProvider, null, frame);
}

module.exports = { SelwiseSearchScreen };
