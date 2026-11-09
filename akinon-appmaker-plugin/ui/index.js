'use strict';

/**
 * The plugin's React Native components.
 *
 * Imported from `.plugins/selwise-akinon-appmaker/ui` so the core plugin —
 * which an app loads at startup, before any screen exists — never pulls React
 * Native's view layer onto the import graph.
 *
 * Every one of these takes the app's own components where it can: `renderItem`
 * on the strips and on search, `renderers` on the surfaces overlay. The
 * built-in versions are for the first hour of an integration and for the demo;
 * they are deliberately plain, so nobody ships one believing it is themed.
 */

const SelwiseSurfaces = require('./SelwiseSurfaces.js');
const strip = require('./RecommendationStrip.js');
const SelwiseSearch = require('./SelwiseSearch.js');
const SelwiseEnrichment = require('./SelwiseEnrichment.js');
const enrichmentDocument = require('./enrichment-document.js');
const surfaces = require('./surfaces/index.js');
const styles = require('./styles.js');
const triggers = require('./triggers.js');
const countdown = require('./countdown.js');

module.exports = {
  SelwiseSurfaces,
  RecommendationStrip: strip.RecommendationStrip,
  RecommendationStrips: strip.RecommendationStrips,
  SelwiseSearch,
  SelwiseEnrichment,
  // The document assembler, for an app rendering enrichment in its own WebView.
  enrichmentUtils: enrichmentDocument,
  // The individual renderers, for an app that wants one surface type in its own
  // layout rather than the whole overlay.
  renderers: surfaces,
  // The CSS-to-RN translation, for an app writing its own renderer against a
  // merchant's `stylesJson`.
  styleUtils: styles,
  triggerUtils: triggers,
  countdownUtils: countdown,
};
