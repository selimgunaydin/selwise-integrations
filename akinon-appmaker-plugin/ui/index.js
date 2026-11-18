'use strict';

/**
 * The plugin's React Native components.
 *
 * Imported from `.plugins/selwise-akinon-appmaker/ui` so the core plugin —
 * which an app loads at startup, before any screen exists — never pulls React
 * Native's view layer onto the import graph.
 *
 * The drawing lives in `@selwise/react-native/ui`, the same components a plain
 * React Native or Expo app uses; this re-exports it, with the two things only an
 * App Maker app has: a `SelwiseProvider` already connected to this plugin (the
 * SDK client, and the app's navigation, basket, WebView and safe area as the
 * components' `host`), and the screen props in App Maker's own route names
 * (`screenName="ProductDetail"`, which the SDK takes as an address,
 * `screen="app://product"`).
 *
 * Every one of the components takes the app's own where it can: `renderItem` on
 * the strips and on search, `renderers` on the surfaces overlay. The built-in
 * versions are for the first hour of an integration and for the demo; they are
 * deliberately plain, so nobody ships one believing it is themed.
 */

const React = require('react');
const sdk = require('@selwise/react-native/ui');
const plugin = require('../integration/index.js');
const { screenUrl } = require('../integration/screens.js');
const { SelwiseProvider } = require('./provider.js');
const { SelwiseSearchScreen } = require('./search-screen.js');

const h = React.createElement;

/** The screen an App Maker route stands for, unless the caller gave the address itself. */
function screenProps(props) {
  const { screenName, screen, ...rest } = props;
  const address = screen || (screenName ? screenUrl(screenName, plugin.screenRoutes()) : undefined);
  return address ? { ...rest, screen: address } : rest;
}

/** A named point on a screen: `screenName` is the App Maker route (`ProductDetail`). */
function SelwiseSlot(props) {
  return h(sdk.SelwiseSlot, screenProps(props));
}

/** Every strip a screen has: `screenName` is the App Maker route. */
function RecommendationStrips(props) {
  return h(sdk.RecommendationStrips, screenProps(props));
}

module.exports = {
  ...sdk,
  SelwiseProvider,
  SelwiseSearchScreen,
  SelwiseSlot,
  RecommendationStrips,
};
