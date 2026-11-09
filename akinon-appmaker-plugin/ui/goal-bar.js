'use strict';

/**
 * The goal bar's decisions that are not drawing: which view each bar shows,
 * and which `goal_reached` a cart change earns.
 *
 * Plain Node, like `countdown.js` and `visibility.js`, so it can be tested
 * without React Native. WHAT a bar says is never decided here: the SDK's
 * `resolveGoalBar` is the same resolver the browser widget and the dashboard
 * preview call, and `goalStepsCrossed` is the SDK's statement of the
 * "crossed while visible" rule. Both are passed in.
 */

const { color, px } = require('./styles.js');

const HIDDEN_VIEW = Object.freeze({
  state: 'unknown',
  visible: false,
  text: '',
  buttonText: '',
  buttonUrl: '',
  progress: null,
});

/**
 * One view per goal bar on screen, keyed by surface id. A bar whose SDK has no
 * `resolveGoalBar` (an app still on an older `@selwise/react-native`) is
 * hidden: there is no honest sentence to draw without the resolver.
 */
function goalBarViews(surfaces, resolve) {
  const views = {};
  for (const surface of surfaces || []) {
    if (!surface || surface.type !== 'goal_bar') continue;
    let view = HIDDEN_VIEW;
    if (typeof resolve === 'function') {
      try {
        view = resolve(surface) || HIDDEN_VIEW;
      } catch (error) {
        view = HIDDEN_VIEW;
      }
    }
    views[surface.id] = view;
  }
  return views;
}

/**
 * The `goal_reached` reports a fresh set of views earns, and the views to
 * remember for the next comparison.
 *
 * Each bar is compared with ITS OWN previous view, and only while it stays on
 * screen: a bar that left (another screen, dismissed) is forgotten, so coming
 * back to it starts fresh and a step already behind the shopper is not
 * reported — the same rule the browser widget keeps per page.
 */
function goalReachedReports(previousViews, surfaces, views, crossed) {
  const reports = [];
  const remembered = {};
  const previous = previousViews || {};

  for (const surface of surfaces || []) {
    if (!surface || surface.type !== 'goal_bar') continue;
    const next = views[surface.id];
    if (!next) continue;
    if (typeof crossed === 'function') {
      for (const step of crossed(previous[surface.id], next) || []) {
        reports.push({ surface: surface, step: step });
      }
    }
    remembered[surface.id] = next;
  }

  return { reports: reports, remembered: remembered };
}

function isOff(value) {
  return value === false || value === 'false';
}

/**
 * The bar's colours and sizes, from the merchant's `stylesJson` — the same keys
 * and the same fallbacks as the browser renderer: the button takes the text
 * colour when no button colour is set, and the completed fill takes the fill
 * colour when no completion colour is.
 */
function goalBarLook(surface, view) {
  const styles = (surface && surface.styles) || {};
  const content = (surface && surface.content) || {};
  const complete = Boolean(view && view.progress && view.progress.complete);
  const fill = color(styles.barFillColor);

  return {
    showBar: !isOff(content.showBar) && Boolean(view && view.progress),
    showClose: styles.showCloseButton === true,
    barHeight: px(styles.barHeight, 6),
    trackColor: color(styles.barTrackColor),
    markerColor: color(styles.textColor),
    fillColor: complete ? color(styles.barCompleteColor) || fill : fill,
    percent: view && view.progress ? Math.max(0, Math.min(100, Number(view.progress.percent) || 0)) : 0,
    // Every step but the last gets a tick: the last IS the end of the bar.
    markers: view && view.progress && Array.isArray(view.progress.markers)
      ? view.progress.markers.slice(0, -1)
      : [],
    buttonStyles: Object.assign({}, styles, {
      buttonColor: styles.buttonColor || styles.textColor,
      buttonTextColor: styles.buttonTextColor || styles.backgroundColor,
    }),
  };
}

module.exports = { HIDDEN_VIEW, goalBarViews, goalReachedReports, goalBarLook };
