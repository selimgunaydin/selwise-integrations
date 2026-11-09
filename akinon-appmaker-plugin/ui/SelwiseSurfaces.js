'use strict';

/**
 * Every campaign and widget that targets the current screen, drawn.
 *
 * ## One mount point, like the web
 *
 * The browser widget injects into the document, so a merchant adds one script
 * tag and their announcement bar appears on every page. This is the same deal:
 * the app mounts `<SelwiseSurfaces />` once at its root and every campaign and
 * widget follows, re-evaluated on each navigation. The alternative — a
 * component per screen — means the merchant edits nine screens to launch one
 * banner, and forgets the tenth.
 *
 * ## What it decides and what it does not
 *
 * Targeting, test mode and dismissal are the SDK's (`getSurfaces()`), so the
 * app and the web agree on who sees what. This component owns only the parts
 * that are inherently native: when a trigger fires, where on screen a position
 * puts something, and which component draws which type.
 */

const React = require('react');
const { AppState, DeviceEventEmitter, Linking, Platform, StyleSheet, View } = require('react-native');

const { resolveTrigger, isModal, SIGNAL } = require('./triggers.js');
const { useSafeAreaInsets } = require('./safe-area.js');
const { shouldRender, keepShownSurfaces } = require('./visibility.js');
const { remainingParts, countdownTargetOf } = require('./countdown.js');
const { goalBarViews, goalReachedReports } = require('./goal-bar.js');
const renderers = require('./surfaces/index.js');

const h = React.createElement;

/**
 * Whether a surface has been triggered yet.
 *
 * Held per surface id rather than as one flag: two popups on the same screen
 * with different triggers must not release each other.
 */
function useTriggered(surfaces) {
  const [triggered, setTriggered] = React.useState({});

  React.useEffect(() => {
    const timers = [];
    const subscriptions = [];
    const next = {};

    for (const surface of surfaces) {
      const trigger = resolveTrigger(surface.placement);

      if (trigger.signal === SIGNAL.IMMEDIATE) {
        next[surface.id] = true;
        continue;
      }

      if (trigger.signal === SIGNAL.TIMER) {
        timers.push(
          setTimeout(() => setTriggered((prev) => ({ ...prev, [surface.id]: true })), trigger.delayMs)
        );
        continue;
      }

      if (trigger.signal === SIGNAL.APP_BACKGROUND) {
        // The app's honest equivalent of leaving: it shows on the way back, so
        // the visitor sees it instead of it firing into a backgrounded app.
        subscriptions.push(
          AppState.addEventListener('change', (state) => {
            if (state === 'background' || state === 'inactive') {
              setTriggered((prev) => ({ ...prev, [surface.id]: true }));
            }
          })
        );
        continue;
      }

      if (trigger.signal === SIGNAL.EVENT && trigger.eventName) {
        subscriptions.push(
          DeviceEventEmitter.addListener(trigger.eventName, () =>
            setTriggered((prev) => ({ ...prev, [surface.id]: true }))
          )
        );
      }
    }

    setTriggered((prev) => ({ ...next, ...prev }));

    return () => {
      for (const timer of timers) clearTimeout(timer);
      for (const subscription of subscriptions) {
        if (subscription && typeof subscription.remove === 'function') subscription.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaces.map((surface) => surface.id).join(',')]);

  return triggered;
}

/**
 * A counter that moves on every cart change.
 *
 * Two readers. The goal bar re-resolves its view from it — here and not inside
 * the bar, because whether the bar is VISIBLE decides whether its impression
 * is recorded, and that decision is the overlay's (`visible` below): a bar that
 * subscribed on its own could hide itself while the overlay still counted it as
 * seen. And the surface list is asked for again, because the SDK chooses
 * content states and fills `{cart.total}` from the cart at `getSurfaces()`
 * time. The host feeds the cart (`setCart`, from the app's basket in
 * `integration/index.js`); this only listens.
 */
function useCartVersion(plugin) {
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const client = plugin && plugin.selwise;
    if (!client || typeof client.onCartChange !== 'function') return undefined;
    return client.onCartChange(() => setVersion((value) => value + 1));
  }, [plugin]);

  return version;
}

/**
 * A counter that moves whenever the product on a ProductDetail screen changes
 * — loaded, swapped for another, or gone while the next one loads. The SDK
 * fills `{product.price}` at `getSurfaces()` time from the product handed to
 * it, so the list is asked for again; the plugin follows the app's own
 * product state (`integration/index.js`), this only listens.
 */
function useProductVersion(plugin) {
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    if (!plugin || typeof plugin.onProductChange !== 'function') return undefined;
    return plugin.onProductChange(() => setVersion((value) => value + 1));
  }, [plugin]);

  return version;
}

/** A second-resolution clock, running only while a countdown is on screen. */
function useTicker(active) {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}

function SelwiseSurfaces(props) {
  const plugin = props.plugin;
  const insets = useSafeAreaInsets();
  const counts = props.counts || {};
  const extraRenderers = props.renderers || {};

  const [screen, setScreen] = React.useState(() => (plugin ? plugin.getScreen() : null));
  const [surfaces, setSurfaces] = React.useState([]);
  const seen = React.useRef(new Set());
  const goalViewsSeen = React.useRef({});
  const loadedScreen = React.useRef(null);
  const cartVersion = useCartVersion(plugin);
  const productVersion = useProductVersion(plugin);

  // Navigation is the only thing that changes which surfaces apply.
  React.useEffect(() => {
    if (!plugin) return undefined;
    return plugin.onScreenChange(setScreen);
  }, [plugin]);

  React.useEffect(() => {
    let cancelled = false;
    const pageUrl = screen && screen.pageUrl;
    if (!plugin || !plugin.selwise || !pageUrl) {
      setSurfaces([]);
      return undefined;
    }

    plugin.ready
      ? plugin.ready.then(load)
      : load();

    // The product this screen shows, on a product screen only — the SDK fills
    // `{product.*}` from it. Part of the screen's identity below: another
    // product on the same `app://product` url is a new screen, and nothing
    // shown for the previous product may be kept on it.
    const product = typeof plugin.getProduct === 'function' ? plugin.getProduct() : null;
    const screenKey = pageUrl + '|' + (product ? JSON.stringify(product) : '');

    // The screen's page type, so "only on product pages" means that in the app
    // too (`screenPageType` in integration/screens.js, set by `setScreen`).
    const pageType = screen && screen.pageType;
    const context = {};
    if (product) context.product = product;
    if (pageType) context.pageType = pageType;

    function load() {
      plugin.selwise
        .getSurfaces(pageUrl, Object.keys(context).length > 0 ? context : undefined)
        .then((result) => {
          // `/config` is fetched in the background at init, so the theme is
          // usually not in hand yet when `applyBrandTheme` first runs. By the
          // time surfaces resolve it is, and applying it before the first paint
          // is what keeps an unmodified widget from flashing its raw
          // `var(--selwise-brand, …)` string.
          if (typeof plugin.applyBrandTheme === 'function') plugin.applyBrandTheme();
          if (cancelled) return;
          // Same screen means the CART moved: what is already in front of the
          // shopper stays as it was shown (`keepShownSurfaces`).
          const sameScreen = loadedScreen.current === screenKey;
          loadedScreen.current = screenKey;
          setSurfaces((previous) =>
            sameScreen ? keepShownSurfaces(previous, result, seen.current) : result
          );
        })
        .catch(() => {
          // A failed cart-time reload keeps what is on screen; only a failed
          // load for a NEW screen empties it.
          if (!cancelled && loadedScreen.current !== screenKey) setSurfaces([]);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [plugin, screen && screen.pageUrl, screen && screen.screenName, cartVersion, productVersion]);

  const triggered = useTriggered(surfaces);

  // The goal bar's words come from the SDK's resolver for the CURRENT cart, so
  // they are re-resolved on every render; the cart version is what causes one.
  const goalBars = surfaces.filter((surface) => surface.type === 'goal_bar');
  const client = plugin && plugin.selwise;
  const goalViews = goalBarViews(
    goalBars,
    client && typeof client.resolveGoalBar === 'function'
      ? (surface) => client.resolveGoalBar(surface)
      : null
  );

  // A daily-cutoff countdown moves its target every day, so the target is
  // asked for on every tick rather than read off `endDate` once.
  const now = Date.now();
  const countdownTarget =
    plugin && typeof plugin.countdownTarget === 'function'
      ? (content, at) => plugin.countdownTarget(content, at)
      : undefined;

  const visible = surfaces.filter(
    (surface) =>
      (!isModal(surface.type) || triggered[surface.id]) &&
      shouldRender(surface, counts, {
        goalBarView: goalViews[surface.id],
        countdownTarget: countdownTarget,
        now: now,
      })
  );
  const hasCountdown = visible.some((surface) => surface.type === 'countdown_timer');
  useTicker(hasCountdown);

  // `goal_reached`: a step the basket passed WHILE the bar was on screen. The
  // previous view of each bar is kept only while it stays on the list, so a
  // bar met again on a later screen starts fresh and a step already behind the
  // shopper is never reported. The SDK sends each step once per session.
  const goalSignature = goalBars
    .map((surface) => {
      const view = goalViews[surface.id];
      return surface.id + ':' + (view.visible ? 1 : 0) + ':' + (view.progress ? view.progress.reachedCount : '-');
    })
    .join(',');
  React.useEffect(() => {
    const { reports, remembered } = goalReachedReports(
      goalViewsSeen.current,
      goalBars,
      goalViews,
      plugin && typeof plugin.goalStepsCrossed === 'function'
        ? (previous, next) => plugin.goalStepsCrossed(previous, next)
        : null
    );
    goalViewsSeen.current = remembered;
    if (!client || typeof client.trackGoalReached !== 'function') return;
    for (const report of reports) {
      client.trackGoalReached(report.surface, { step: report.step });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, goalSignature, cartVersion]);

  // The impression belongs to the moment something became visible, not to the
  // moment it was fetched: a popup waiting on its trigger has not been seen,
  // and neither has a count badge below the merchant's threshold — which is
  // what `shouldRender` above keeps out of this list.
  React.useEffect(() => {
    if (!plugin || !plugin.selwise) return;
    for (const surface of visible) {
      if (seen.current.has(surface.id)) continue;
      seen.current.add(surface.id);
      plugin.selwise.trackSurfaceView(surface);
      // The same moment spends the frequency-cap allowance. It is charged here
      // rather than when the list was fetched, so a popup still waiting on its
      // trigger — or one `shouldRender` held back — keeps its allowance for the
      // screen where it actually appears.
      if (typeof plugin.selwise.recordSurfaceShown === 'function') {
        Promise.resolve(plugin.selwise.recordSurfaceShown(surface)).catch(() => {});
      }
    }
  }, [plugin, visible.map((surface) => surface.id).join(',')]);

  /** A url the widget itself supplied, already tracked by the caller. */
  const navigateToUrl = (surface, url) => {
    if (typeof props.onNavigate === 'function') {
      props.onNavigate(url, surface);
      return;
    }
    if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => {});
  };

  /** `url` overrides the content's link — a goal bar's button changes with its state. */
  const navigate = (surface, url_) => {
    const url = String((url_ !== undefined ? url_ : surface.content.buttonUrl) || '').trim();
    plugin.selwise.trackSurfaceClick(surface, url ? { linkUrl: url } : undefined);
    if (!url) return;

    if (typeof props.onNavigate === 'function') {
      props.onNavigate(url, surface);
      return;
    }
    // A relative path is the storefront's, so it needs the app's own router.
    // Without one, an absolute url still opens; a relative one is left alone
    // rather than sent to the OS, which would fail silently.
    if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => {});
  };

  const dismiss = (surface) => {
    plugin.selwise.dismissSurface(surface).catch(() => {});
    setSurfaces((prev) => prev.filter((entry) => entry.id !== surface.id));
  };

  function renderSurface(surface, extra) {
    const custom = extraRenderers[surface.type];
    if (custom) {
      // A goal bar's own renderer gets the resolved view too: drawing it from
      // `surface.content` would print the raw `{goal.remaining}` template.
      const goalView = surface.type === 'goal_bar' ? goalViews[surface.id] : undefined;
      return h(custom, {
        key: surface.id,
        surface: surface,
        ...(goalView ? { view: goalView } : {}),
        onPress: () => (goalView ? navigate(surface, goalView.buttonUrl) : navigate(surface)),
        onDismiss: () => dismiss(surface),
      });
    }

    const shared = {
      key: surface.id,
      surface: surface,
      onPress: () => navigate(surface),
      onDismiss: () => dismiss(surface),
    };

    switch (surface.type) {
      case 'announcement_bar':
        return h(renderers.AnnouncementBar, shared);
      case 'sticky_footer':
        return h(renderers.StickyFooter, shared);
      case 'floating_button':
        return h(renderers.FloatingButton, {
          ...shared,
          bottomInset: (extra && extra.bottomInset) || 0,
        });
      case 'countdown_timer':
        return h(renderers.CountdownTimer, {
          ...shared,
          remaining: remainingParts(countdownTargetOf(surface.content, now, countdownTarget), now),
        });
      case 'goal_bar': {
        const view = goalViews[surface.id];
        return h(renderers.GoalBar, {
          ...shared,
          view: view,
          onPress: () => navigate(surface, view ? view.buttonUrl : ''),
        });
      }
      case 'cart_count':
        return h(renderers.CountBadge, { ...shared, value: counts.cart });
      case 'product_view_count':
        return h(renderers.CountBadge, { ...shared, value: counts.productView });
      case 'newsletter':
        return h(renderers.Newsletter, {
          ...shared,
          onSubmit: (email) => plugin.subscribeNewsletter(email, surface),
        });
      case 'custom':
        // The merchant's own HTML/CSS/JS, in a WebView. It needs the plugin
        // (for the basket and tracking) and a url handler, not the shared
        // press/dismiss pair the structured types take.
        return h(renderers.CustomWidget, {
          key: surface.id,
          surface: surface,
          plugin: plugin,
          onPress: (url) => (url ? navigateToUrl(surface, url) : navigate(surface)),
          onDismiss: () => dismiss(surface),
        });
      case 'slide_in':
      case 'exit_intent_popup':
      case 'popup':
      case 'modal':
        return h(renderers.SurfaceModal, shared);
      default:
        // An unknown type is a surface this plugin version predates. Drawing a
        // fallback box would put an unstyled rectangle on a merchant's screen.
        return null;
    }
  }

  if (visible.length === 0) return null;

  const top = visible.filter((s) => !isModal(s.type) && s.placement.position === 'top');
  const bottom = visible.filter(
    (s) => !isModal(s.type) && (s.placement.position === 'bottom' || s.type === 'sticky_footer')
  );
  const floating = visible.filter((s) => s.type === 'floating_button');
  const modals = visible.filter((s) => isModal(s.type));
  const inline = visible.filter(
    (s) => !top.includes(s) && !bottom.includes(s) && !floating.includes(s) && !modals.includes(s)
  );

  return h(
    React.Fragment,
    null,
    // Safe-area insets, not a guessed constant: an announcement bar docked at
    // `top: 0` renders UNDER the status bar, so the merchant's copy collides
    // with the clock — which is exactly what it did before this line existed.
    top.length > 0
      ? h(
          View,
          { style: [sheet.dock, sheet.top, { paddingTop: insets.top }], pointerEvents: 'box-none' },
          top.map(renderSurface)
        )
      : null,
    inline.length > 0
      ? h(
          View,
          {
            style: [sheet.dock, sheet.top, { paddingTop: insets.top + (top.length > 0 ? 0 : 0) }],
            pointerEvents: 'box-none',
          },
          inline.map(renderSurface)
        )
      : null,
    bottom.length > 0
      ? h(
          View,
          {
            style: [sheet.dock, sheet.bottom, { paddingBottom: insets.bottom }],
            pointerEvents: 'box-none',
          },
          bottom.map(renderSurface)
        )
      : null,
    floating.map((surface) => renderSurface(surface, { bottomInset: insets.bottom })),
    modals.map(renderSurface)
  );
}

const sheet = StyleSheet.create({
  // `box-none` on the docks: the areas between surfaces must stay tappable, or
  // a full-width announcement bar would swallow taps on the app's own header.
  dock: { position: 'absolute', left: 0, right: 0, zIndex: 9999 },
  top: { top: 0 },
  bottom: { bottom: 0 },
});

module.exports = SelwiseSurfaces;
