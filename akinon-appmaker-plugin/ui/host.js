'use strict';

/**
 * The plugin as the SDK components' `host`: what `@selwise/react-native/ui`
 * cannot know about an App Maker app, answered from the app itself.
 *
 * - a link goes through App Maker's own deep-link map (`openStorefrontPath`),
 *   so `/baskets/basket/` opens the Basket screen instead of a browser;
 * - an add-to-cart goes through the app's own basket action;
 * - a product card's favourite heart goes through the app's own favourites
 *   requests (`integration/favourites.js`), when the app has them;
 * - the WebView, the safe-area insets and the navigation focus are the app's,
 *   loaded when the app has them. The plugin installs without touching the
 *   native projects, so none of them is a dependency of it.
 *
 * Built once: the components redraw when the host object changes, and it never
 * has to.
 */

const React = require('react');
const { createFavourites } = require('../integration/favourites.js');

function loadWebView() {
  try {
    // eslint-disable-next-line global-require
    const module_ = require('react-native-webview');
    return (module_ && (module_.WebView || module_.default)) || null;
  } catch (error) {
    return null;
  }
}

function loadSafeAreaHook() {
  try {
    // eslint-disable-next-line global-require
    const context = require('react-native-safe-area-context');
    return context && typeof context.useSafeAreaInsets === 'function' ? context.useSafeAreaInsets : null;
  } catch (error) {
    return null;
  }
}

/** React Navigation's `useNavigation`, when the app has it: the strips' focus gate. */
function loadUseNavigation() {
  try {
    // eslint-disable-next-line global-require
    const navigation = require('@react-navigation/native');
    return typeof navigation.useNavigation === 'function' ? navigation.useNavigation : null;
  } catch (error) {
    return null;
  }
}

/** A strip counts an impression while the screen it sits on is the focused one. */
function focusHook(useNavigation) {
  return function useIsFocused() {
    let navigation = null;
    try {
      navigation = useNavigation();
    } catch (error) {
      // Not inside a navigator: no focus gating.
      navigation = null;
    }
    return React.useCallback(
      () => !navigation || typeof navigation.isFocused !== 'function' || navigation.isFocused(),
      [navigation]
    );
  };
}

// Each App Maker module is asked for by a LITERAL name: Metro resolves a
// `require` at build time and refuses one whose argument is a variable
// ("Invalid call … require(name)"), so a generic loader would break the app's
// bundle. A project without the module throws, and the feature is left out.
function unwrap(imported) {
  return (imported && (imported.default || imported)) || null;
}

function requireContainer() {
  try {
    // eslint-disable-next-line global-require
    return unwrap(require('@services/container'));
  } catch (error) {
    return null;
  }
}

function requireStore() {
  try {
    // eslint-disable-next-line global-require
    return unwrap(require('@core/store'));
  } catch (error) {
    return null;
  }
}

function requireNavigation() {
  try {
    // eslint-disable-next-line global-require
    return unwrap(require('@core/navigation'));
  } catch (error) {
    return null;
  }
}

/**
 * The app's favourites for a card's heart, or null when the app has none (a
 * project without the favourites container draws no heart).
 */
function buildFavourites(plugin) {
  const favourites = createFavourites({
    actions: () => {
      const container = requireContainer();
      return container ? container.get('dataContainers') || null : null;
    },
    store: () => requireStore(),
    // A guest's heart sends them to sign in, as the app's own heart does: the
    // standard route name first, then the shop's login address.
    requestLogin: () => {
      const navigation = requireNavigation();
      if (navigation && typeof navigation.navigate === 'function') {
        navigation.navigate('SignIn');
        return true;
      }
      const container = requireContainer();
      const maps = container ? container.get('integrationMaps') : null;
      const login = (maps && maps.urls && maps.urls.LOGIN) || '/users/login/';
      return plugin.openStorefrontPath(login);
    },
  });
  return favourites.available() ? favourites : null;
}

/** @returns {import('@selwise/react-native/ui').SelwiseHost} */
function buildHost(plugin) {
  const WebView = loadWebView();
  const safeArea = loadSafeAreaHook();
  const useNavigation = loadUseNavigation();
  const enrichment = plugin.config && plugin.config.enrichment;
  const storefrontUrl = plugin.storefrontUrl();
  const favourites = buildFavourites(plugin);

  return {
    // A screen address (`app://basket`) opens the App Maker route it is mapped
    // from (`screenRouteOf`, the app's own `screenRoutes` first); joining it onto
    // the shop's origin would be a link to nowhere. A storefront path or an https
    // link on the shop's domain opens the matching screen through the deep link map.
    navigate: (target) => (target.kind === 'screen' ? plugin.openScreen(target.url) : plugin.openStorefrontPath(target.url)),
    // `{ success, message? }`: a refusal carries the storefront's own sentence,
    // which the SDK shows where the shopper pressed the button.
    addToCart: (item) =>
      plugin.addToCartDetailed({ id: item.surfaceId }, item.code, item.quantity, item.source),
    // The card's heart: drawn only where the app has a favourites list to call.
    ...(favourites
      ? {
          toggleWishlist: (request) => favourites.toggle(request),
          isWishlisted: (code, product) => favourites.isWishlisted(code, product),
          subscribeWishlist: (listener) => favourites.subscribe(listener),
        }
      : {}),
    ...(WebView ? { WebView } : {}),
    ...(safeArea ? { safeAreaInsets: safeArea } : {}),
    ...(useNavigation ? { useIsFocused: focusHook(useNavigation) } : {}),
    ...(storefrontUrl ? { storefrontUrl } : {}),
    ...(enrichment && typeof enrichment === 'object' ? { enrichment } : {}),
  };
}

const hosts = new WeakMap();

/** The plugin's host, built the first time it is asked for. */
function hostOf(plugin) {
  let host = hosts.get(plugin);
  if (!host) {
    host = buildHost(plugin);
    hosts.set(plugin, host);
  }
  return host;
}

module.exports = { hostOf, buildHost };
