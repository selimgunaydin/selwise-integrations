import {
  createElement as h,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';
import { AppState, DeviceEventEmitter, StyleSheet, View } from 'react-native';
import { useSelwise } from '../react/context.js';
import {
  useCartVersion,
  useConfigVersion,
  useExperimentsVersion,
  useLocale,
  useProduct,
  useScreen,
  useSelwiseReady,
} from '../react/use-selwise-state.js';
import { goalStepsCrossed } from '../core/goal-bar.js';
import { counterProductCode, productCountQuestion, type ProductCountQuestion } from '../core/product-counts.js';
import type { Surface } from '../core/surfaces.js';
import type { GoalBarView } from '../vendor/dynamic-content.js';
import { countdownTarget as contractCountdownTarget } from '../vendor/dynamic-content.js';
import { countdownUnits, countdownTargetOf } from './countdown.js';
import { goalBarViews, goalReachedReports } from './goal-bar.js';
import { useBrandTheme, useNavigate, useSafeAreaInsets } from './host-hooks.js';
import { settleScreenInterrupting } from './interrupting.js';
import { bottomReserve, isModalSurface, layoutOf, slotBelongsToScreen } from './placement.js';
import { mergeScenarioSurfaces } from './scenario-surfaces.js';
import { boardOf, useBoardState } from './surface-board.js';
import { debugBoardOf, type DrawnSurface } from './debug-board.js';
import { SelwiseDebugOverlay } from './SelwiseDebugOverlay.js';
import * as renderers from './surfaces/index.js';
import type { SurfaceRendererProps } from './surfaces/index.js';
import { leavesApp, resolveTrigger, SIGNAL } from './triggers.js';
import { keepShownSurfaces, renderVerdict } from './visibility.js';
import type { NotShownInput } from '../core/not-shown.js';

/**
 * Every campaign and widget that targets the current screen, drawn.
 *
 * ## One mount point, like the web
 *
 * The browser widget injects into the document, so a merchant adds one script
 * tag and their announcement bar appears on every page. This is the same deal:
 * the app mounts `<SelwiseSurfaces />` once at its root (inside
 * `<SelwiseProvider>`) and every campaign and widget follows, re-evaluated on
 * each navigation. The alternative — a component per screen — means the
 * merchant edits nine screens to launch one banner, and forgets the tenth.
 *
 * ## What it decides and what it does not
 *
 * Targeting, test mode and dismissal are the client's (`getSurfaces()`), so the
 * app and the web agree on who sees what. This component owns only the parts
 * that are inherently native: when a trigger fires, where on screen a position
 * puts something, and which component draws which type.
 */

/** A renderer for one surface type. A goal bar's also receives the resolved `view`. */
export type SurfaceRenderer = ComponentType<SurfaceRendererProps & { view?: GoalBarView }>;

export interface SelwiseSurfacesProps {
  /**
   * Draw a type with the app's own component. A goal bar's receives the
   * resolved `view` too: draw from it, never from `surface.content`, which
   * still holds the `{goal.remaining}` template.
   */
  renderers?: Partial<Record<string, SurfaceRenderer>>;
  /**
   * Opens a link a surface points at, instead of `host.navigate`. The click is
   * already reported.
   */
  onNavigate?: (url: string, surface: Surface) => void;
}

/**
 * Whether a surface has been triggered yet.
 *
 * Held per surface id rather than as one flag: two popups on the same screen
 * with different triggers must not release each other.
 */
function useTriggered(surfaces: readonly Surface[]): Record<string, boolean> {
  const [triggered, setTriggered] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const subscriptions: Array<{ remove?: () => void } | undefined> = [];
    const next: Record<string, boolean> = {};

    for (const surface of surfaces) {
      // Only a surface that takes the screen waits for a trigger: a bar, a
      // counter, a newsletter sitting in a point of the screen has none.
      if (!isModalSurface(surface)) continue;
      const trigger = resolveTrigger(surface.placement);

      if (trigger.signal === SIGNAL.IMMEDIATE) {
        next[surface.id] = true;
        continue;
      }

      if (trigger.signal === SIGNAL.TIMER) {
        timers.push(setTimeout(() => setTriggered((prev) => ({ ...prev, [surface.id]: true })), trigger.delayMs));
        continue;
      }

      if (trigger.signal === SIGNAL.APP_BACKGROUND) {
        // The app's honest equivalent of leaving: it shows on the way back, so
        // the visitor sees it instead of it firing into a backgrounded app.
        // `inactive` (iOS: control centre, a system dialog) is not leaving.
        subscriptions.push(
          AppState.addEventListener('change', (state) => {
            if (leavesApp(state)) {
              setTriggered((prev) => ({ ...prev, [surface.id]: true }));
            }
          })
        );
        continue;
      }

      if (trigger.signal === SIGNAL.EVENT && trigger.eventName) {
        subscriptions.push(
          DeviceEventEmitter.addListener(trigger.eventName, () => setTriggered((prev) => ({ ...prev, [surface.id]: true })))
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

/** `setState` updater: stays on the same array when there was nothing and still is nothing. */
function keepEmpty<T>(previous: T[]): T[] {
  return previous.length === 0 ? previous : [];
}

/**
 * The scenario claims that can be drawn on this screen — a scenario's "show in
 * the app" step leaves a claim on the server, and the client turns it into a
 * surface the shopper's screen accepts (`getScenarioSurfaces`).
 *
 * Asked again when the app comes to the foreground (the inbox is refreshed then,
 * at most once a minute otherwise) and when the screen, the product or the cart
 * changes, because each can change which claim fits.
 */
function useScenarioSurfaces(
  pageUrl: string | null,
  pageType: string | null,
  product: ReturnType<typeof useProduct>,
  cartVersion: number,
  ready: boolean
): Array<{ deliveryId: string; surface: Surface }> {
  const client = useSelwise();
  const [claims, setClaims] = useState<Array<{ deliveryId: string; surface: Surface }>>([]);

  useEffect(() => {
    if (!ready || !pageUrl) {
      setClaims(keepEmpty);
      return undefined;
    }
    let cancelled = false;
    const context = { ...(pageType ? { pageType } : {}), ...(product ? { product } : {}) };

    const run = (refresh: boolean) => {
      client
        .getScenarioSurfaces(pageUrl, context, { refresh })
        .then((list) => {
          // Most channels have no scenario: an empty answer keeps the same array, so it
          // costs the overlay no re-render on every screen, cart change and foreground.
          if (!cancelled) setClaims(Array.isArray(list) && list.length > 0 ? list : keepEmpty);
        })
        .catch(() => {
          // A scenario is an enhancement: a failure draws nothing and breaks nothing.
        });
    };
    run(false);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run(true);
    });
    return () => {
      cancelled = true;
      if (subscription && typeof subscription.remove === 'function') subscription.remove();
    };
  }, [client, ready, pageUrl, pageType, product, cartVersion]);

  return claims;
}

/** A second-resolution clock, running only while a countdown is on screen. */
function useTicker(active: boolean): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}

/**
 * The numbers the counter surfaces of this screen show: how many people viewed
 * or carted the product, asked of the public API once per product and period
 * (`getProductCount`, cached and shared). Which product is the merchant's
 * `productId`, else the one the screen shows (`setProduct({ itemCode })`); with
 * neither there is nothing to ask and the counter is not drawn.
 *
 * Returns the number for a surface: a count, `null` when it could not be read,
 * `undefined` while it is still being asked or has no product to ask about.
 */
function useCounterNumbers(
  client: ReturnType<typeof useSelwise>,
  surfaces: readonly Surface[],
  product: ReturnType<typeof useProduct>
): (surface: Surface) => number | null | undefined {
  const questionOf = (surface: Surface): ProductCountQuestion | null => {
    if (surface.type !== 'cart_count' && surface.type !== 'product_view_count') return null;
    const code = counterProductCode(surface.content, product);
    return code ? productCountQuestion(surface.type, code, surface.content) : null;
  };
  const asked = surfaces.map(questionOf).filter((question): question is ProductCountQuestion => question !== null);
  const signature = JSON.stringify(asked);
  const [numbers, setNumbers] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;
    for (const question of asked) {
      client
        .getProductCount(question)
        .then((count) => {
          if (!cancelled) setNumbers((previous) => ({ ...previous, [JSON.stringify(question)]: count }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // `signature` is the asked list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, signature]);

  return (surface) => {
    const question = questionOf(surface);
    return question ? numbers[JSON.stringify(question)] : undefined;
  };
}

/**
 * Whether the app is in front of the shopper (`AppState` `active`). A surface is
 * SEEN only then: one an exit-intent trigger raised as the app went to the
 * background is counted when the shopper comes back to it, not while it was
 * drawn into a backgrounded app.
 */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => {
      if (subscription && typeof subscription.remove === 'function') subscription.remove();
    };
  }, []);
  return active;
}

export function SelwiseSurfaces(props: SelwiseSurfacesProps): ReactElement | null {
  const client = useSelwise();
  const board = boardOf(client);
  useBoardState(board);
  const appActive = useAppActive();
  useBrandTheme();
  const insets = useSafeAreaInsets();
  const navigateTo = useNavigate();
  const extraRenderers = props.renderers || {};

  const ready = useSelwiseReady();
  const screen = useScreen();
  const product = useProduct();
  const cartVersion = useCartVersion();
  const locale = useLocale();
  // The visitor's arms were dropped (a QA link, a consent answer): ask again, a
  // screen experiment decides which campaigns its point draws.
  const experimentsVersion = useExperimentsVersion();
  // A campaign published while the app is open (`on('config')`).
  const configVersion = useConfigVersion();

  const [ownSurfaces, setSurfaces] = useState<Surface[]>([]);
  const seen = useRef(new Set<string>());
  const goalViewsSeen = useRef<Record<string, GoalBarView>>({});
  const loadedScreen = useRef<string | null>(null);
  /** Popups the visitor left through their button or picture, on the screen they are on. */
  const leftScreen = useRef(new Set<string>());
  /** The one interrupting surface that holds the screen: it stays until it closes (`settleScreenInterrupting`). */
  const openInterrupting = useRef<string | null>(null);
  /** The height the bottom dock measured: a floating element in a bottom corner is lifted above it. */
  const [bottomDockHeight, setBottomDockHeight] = useState(0);

  // Navigation, the product, the basket and the language are the things that
  // change which surfaces apply, and what they say.
  useEffect(() => {
    let cancelled = false;
    const pageUrl = screen.pageUrl;
    if (!ready || !pageUrl) {
      setSurfaces(keepEmpty);
      return undefined;
    }

    // The product this screen shows, on a product screen only — the client
    // fills `{product.*}` from it. Part of the screen's identity below: another
    // product on the same `app://product` url is a new screen, and nothing
    // shown for the previous product may be kept on it.
    const screenKey = pageUrl + '|' + (product ? JSON.stringify(product) : '');

    // The screen's page type, so "only on product pages" means that in the app
    // too (the host names it with `setScreen`).
    const context: { product?: NonNullable<typeof product>; pageType?: string } = {};
    if (product) context.product = product;
    if (screen.pageType) context.pageType = screen.pageType;

    client
      .getSurfaces(pageUrl, Object.keys(context).length > 0 ? context : undefined)
      .then((result) => {
        if (cancelled) return;
        // Same screen means the CART moved: what is already in front of the
        // shopper stays as it was shown (`keepShownSurfaces`).
        const sameScreen = loadedScreen.current === screenKey;
        loadedScreen.current = screenKey;
        if (!sameScreen) leftScreen.current.clear();
        setSurfaces((previous) => (sameScreen ? keepShownSurfaces(previous, result, seen.current) : result));
      })
      .catch(() => {
        // A failed cart-time reload keeps what is on screen; only a failed
        // load for a NEW screen empties it.
        if (!cancelled && loadedScreen.current !== screenKey) setSurfaces(keepEmpty);
      });

    return () => {
      cancelled = true;
    };
  }, [client, ready, screen.pageUrl, screen.screenName, screen.pageType, product, cartVersion, locale, experimentsVersion, configVersion]);

  // The screen's own surfaces with a scenario's laid over them (`scenario-surfaces.ts`).
  const scenarioClaims = useScenarioSurfaces(screen.pageUrl, screen.pageType, product, cartVersion, ready);
  const surfaces = useMemo(() => mergeScenarioSurfaces(ownSurfaces, scenarioClaims), [ownSurfaces, scenarioClaims]);

  const triggered = useTriggered(surfaces);
  const countOf = useCounterNumbers(client, surfaces, product);
  /** The number a counter draws, as the renderer's prop. */
  const numberOf = (surface: Surface): { value?: number } => {
    const count = countOf(surface);
    return typeof count === 'number' ? { value: count } : {};
  };

  // The goal bar's words come from the client's resolver for the CURRENT cart, so
  // they are re-resolved on every render; the cart version is what causes one.
  const goalBars = surfaces.filter((surface) => surface.type === 'goal_bar');
  const goalViews = goalBarViews(goalBars, (surface) => client.resolveGoalBar(surface));

  // A daily-cutoff countdown moves its target every day, so the target is
  // asked for on every tick rather than read off `endDate` once.
  const now = Date.now();

  // A surface the merchant sent to a point is drawn only where the app mounted
  // that point, on the screen that has it: no point, no surface — never a dock
  // it was not placed in, and never an impression for one nobody could see.
  const slotMounted = (surface: Surface): boolean => {
    const slot = layoutOf(surface).slot;
    return !slot || (board.isMounted(slot) && slotBelongsToScreen(slot, screen.pageUrl));
  };

  // Each surface the client delivered is drawn, or is left off for ONE reason, named
  // with the dashboard's own code (`explain()` reads them; nothing here decides twice).
  let visible: Surface[] = [];
  const leftOff: NotShownInput[] = [];
  for (const surface of surfaces) {
    const miss = drawMiss(surface);
    if (miss === null) visible.push(surface);
    else leftOff.push({ id: surface.id, kind: 'campaign', type: surface.type, ...miss });
  }
  function drawMiss(surface: Surface): Omit<NotShownInput, 'id' | 'kind' | 'type'> | null {
    if (leftScreen.current.has(surface.id)) return { reason: 'dismissed', detail: { cause: 'left_screen' } };
    if (isModalSurface(surface) && !triggered[surface.id]) {
      return { reason: 'trigger_armed', detail: { trigger: surface.placement.triggerStrategy } };
    }
    if (!slotMounted(surface)) return { reason: 'campaignSlot', detail: { slot: layoutOf(surface).slot } };
    const verdict = renderVerdict(
      surface,
      { count: countOf(surface), productKnown: counterProductCode(surface.content, product) !== null },
      {
        goalBarView: goalViews[surface.id],
        countdownTarget: contractCountdownTarget,
        now: now,
        canDraw: (type) => Boolean(extraRenderers[type]),
      }
    );
    return verdict ? { reason: verdict.reason, ...(verdict.detail ? { detail: verdict.detail } : {}) } : null;
  }
  // One interrupting surface at a time, as on the web: a popup, a slide-in and a
  // newsletter in different positions never competed for a dock, and were open
  // together. The surface that is open stays; the others wait, armed, and are
  // left off for now with the conflict reason (they open as it closes).
  const settled = settleScreenInterrupting(visible, openInterrupting.current);
  // Remembered once the render is committed: a render React discards (strict
  // mode, an interrupted concurrent render) must not move the turn.
  const settledOpenId = settled.openId;
  useEffect(() => {
    openInterrupting.current = settledOpenId;
  }, [settledOpenId]);
  visible = settled.drawn;
  for (const surface of settled.waiting) {
    leftOff.push({
      id: surface.id,
      kind: 'campaign',
      type: surface.type,
      reason: 'conflict',
      detail: { cause: 'interrupting_open', open: settled.openId },
    });
  }
  // Said to the client once per change of the list, so a re-render costs nothing.
  const leftOffSignature = leftOff.map((entry) => `${entry.id}:${entry.reason}`).join(',');
  useEffect(() => {
    if (ready && screen.pageUrl) client.noteDrawn(screen.pageUrl, 'campaign', leftOff);
    // `leftOffSignature` is the list; the effect is about it changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ready, screen.pageUrl, leftOffSignature, ownSurfaces]);
  // What the shopper can SEE: the app in front, and a surface in a point only
  // while that point is on the screen (a point below the fold is not seen yet).
  const seenNow = appActive
    ? visible.filter((surface) => {
        const slot = layoutOf(surface).slot;
        return !slot || board.isOnScreen(slot);
      })
    : [];
  const hasCountdown = visible.some((surface) => surface.type === 'countdown_timer');
  useTicker(hasCountdown);

  // `goal_reached`: a step the basket passed WHILE the bar was on screen. The
  // previous view of each bar is kept only while it stays on the list, so a
  // bar met again on a later screen starts fresh and a step already behind the
  // shopper is never reported. The client sends each step once per session.
  const goalSignature = goalBars
    .map((surface) => {
      const view = goalViews[surface.id];
      return surface.id + ':' + (view && view.visible ? 1 : 0) + ':' + (view && view.progress ? view.progress.reachedCount : '-');
    })
    .join(',');
  useEffect(() => {
    const { reports, remembered } = goalReachedReports(goalViewsSeen.current, goalBars, goalViews, goalStepsCrossed);
    goalViewsSeen.current = remembered;
    for (const report of reports) {
      client.trackGoalReached(report.surface, { step: report.step });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, goalSignature, cartVersion]);

  // The impression belongs to the moment something became visible, not to the
  // moment it was fetched: a popup waiting on its trigger has not been seen,
  // and neither has a count badge below the merchant's threshold — which is
  // what `shouldRender` above keeps out of this list.
  useEffect(() => {
    for (const surface of seenNow) {
      if (seen.current.has(surface.id)) continue;
      seen.current.add(surface.id);
      // `visible`: counted when seen, not when fetched — the basis the strips use.
      client.trackSurfaceView(surface, { basis: 'visible' });
      // A scenario claim is answered the moment it is on screen: "shown" closes it
      // server-side (and locally, so the next launch does not draw it again).
      if (surface.scenario) {
        Promise.resolve(
          client.acknowledgeScenarioDeliveries([{ deliveryId: surface.scenario.deliveryId, outcome: 'shown' }])
        ).catch(() => undefined);
      }
      // The same moment spends the frequency-cap allowance. It is charged here
      // rather than when the list was fetched, so a popup still waiting on its
      // trigger — or one `shouldRender` held back — keeps its allowance for the
      // screen where it actually appears.
      Promise.resolve(client.recordSurfaceShown(surface)).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, seenNow.map((surface) => surface.id).join(',')]);

  /** A url the widget itself supplied, already tracked by the caller. */
  const navigateToUrl = (surface: Surface, url: string) => {
    if (typeof props.onNavigate === 'function') {
      props.onNavigate(url, surface);
      return;
    }
    void navigateTo({ url, source: surface.type === 'custom' ? 'custom_widget' : 'campaign', entityId: surface.id });
  };

  /**
   * The popup takes the screen, and a tap on its button or its picture takes the
   * visitor away: it leaves with them (the web's `closeModal(false)`), WITHOUT
   * being remembered as closed — a tap is not a dismissal, and the cap decides
   * whether it comes back. The slide-in and the newsletter stay (the web's do).
   */
  const leaves = (surface: Surface): boolean => surface.type === 'exit_intent_popup' || surface.type === 'popup' || surface.type === 'modal';

  /**
   * `url` overrides the content's link — a goal bar's button changes with its
   * state. A link is an `app://` screen of the catalogue (the host's `navigate`
   * opens it), an `https` page or a custom-scheme link; the click is reported
   * first, as the experiment's click goal and the report's click.
   */
  const navigate = (surface: Surface, override?: string) => {
    const url = String((override !== undefined ? override : surface.content['buttonUrl']) || '').trim();
    client.trackSurfaceClick(surface, url ? { linkUrl: url } : undefined);
    if (url) navigateToUrl(surface, url);
    if (leaves(surface)) {
      // Held out for the rest of this screen: a basket change asks the client
      // again, and it would bring a popup the visitor just left straight back.
      leftScreen.current.add(surface.id);
      setSurfaces((prev) => prev.filter((entry) => entry.id !== surface.id));
    }
  };

  const dismiss = (surface: Surface) => {
    client.dismissSurface(surface).catch(() => undefined);
    setSurfaces((prev) => prev.filter((entry) => entry.id !== surface.id));
  };

  function renderSurface(surface: Surface, extra?: { insets?: { top: number; bottom: number } }): ReactElement | null {
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
    const slot = layoutOf(surface).slot;
    // The picture's own link: reported and opened like the button, and it takes the popup away with it.
    const onImagePress = (url: string) => navigate(surface, url);

    switch (surface.type) {
      case 'announcement_bar':
        return h(renderers.AnnouncementBar, shared);
      case 'sticky_footer':
        return h(renderers.StickyFooter, shared);
      case 'floating_button':
        return h(renderers.FloatingButton, { ...shared, ...(extra?.insets ? { insets: extra.insets } : {}) });
      case 'countdown_timer':
        return h(renderers.CountdownTimer, {
          ...shared,
          locale,
          units: countdownUnits(countdownTargetOf(surface.content, now, contractCountdownTarget), now),
        });
      case 'goal_bar': {
        const view = goalViews[surface.id];
        return h(renderers.GoalBar, {
          ...shared,
          ...(view ? { view } : {}),
          onPress: () => navigate(surface, view ? view.buttonUrl : ''),
        });
      }
      case 'cart_count':
        return h(renderers.CountBadge, { ...shared, locale, ...numberOf(surface) });
      case 'product_view_count':
        return h(renderers.CountBadge, { ...shared, locale, ...numberOf(surface) });
      case 'newsletter':
        return h(renderers.Newsletter, {
          key: surface.id,
          surface: surface,
          locale,
          inSlot: slot !== null,
          onDismiss: () => dismiss(surface),
          onSubmit: (
            email: string,
            sms?: { phone: string; smsConsent: true },
            consent?: { text: string; version: string }
          ) =>
            client
              .subscribeNewsletter(email, {
                surfaceId: surface.id,
                // The SMS opt-in the shopper ticked on the form: a number and their consent.
                ...(sms && sms.smsConsent && sms.phone ? { phone: sms.phone, smsConsent: true } : {}),
                // The wording the form showed, and its version: the opt-in's evidence.
                ...(consent ? { consentText: consent.text, consentTextVersion: consent.version } : {}),
                // The screen the form was on.
                ...(screen.pageUrl ? { sourcePath: screen.pageUrl } : {}),
              })
              .catch(() => ({ success: false })),
          onOpenLink: (url: string) => navigateTo({ url, source: 'newsletter', entityId: surface.id }),
        });
      case 'custom':
        // The merchant's own HTML/CSS/JS, in a WebView. It needs the client
        // (tracking) and a url handler, not the shared press/dismiss pair the
        // structured types take.
        return h(renderers.CustomWidget, {
          key: surface.id,
          surface: surface,
          onPress: (url?: string) => (url ? navigateToUrl(surface, url) : navigate(surface)),
          onDismiss: () => dismiss(surface),
        });
      case 'slide_in':
        return h(renderers.SlideIn, { ...shared, onImagePress, ...(extra?.insets ? { bottomInset: extra.insets.bottom } : {}) });
      case 'exit_intent_popup':
      case 'popup':
      case 'modal':
        // The popup's scrim closes it (recorded as a close), as the web's does.
        return h(renderers.SurfaceModal, { ...shared, onImagePress, dismissOnBackdrop: true });
      default:
        // An unknown type is a surface this version predates. Drawing a
        // fallback box would put an unstyled rectangle on a merchant's screen.
        return null;
    }
  }

  // Where each drawn surface goes (`APP_WIDGET_PLACEMENT`): a dock, a corner or an
  // edge, a window — or a point, which draws it itself from what is published here.
  const layouts = visible.map((surface) => ({ surface, layout: layoutOf(surface) }));
  const top = layouts.filter((entry) => entry.layout.mode === 'dock' && entry.layout.position === 'top').map((entry) => entry.surface);
  const bottom = layouts.filter((entry) => entry.layout.mode === 'dock' && entry.layout.position === 'bottom').map((entry) => entry.surface);
  const floating = layouts
    .filter((entry) => entry.layout.mode === 'floating' || entry.surface.type === 'slide_in')
    .map((entry) => entry.surface);
  const modals = layouts
    .filter((entry) => entry.layout.mode === 'modal' && entry.surface.type !== 'slide_in')
    .map((entry) => entry.surface);
  const slotted = new Map<string, ReactElement[]>();
  for (const { surface, layout } of layouts) {
    if (layout.mode !== 'slot' || !layout.slot) continue;
    const element = renderSurface(surface);
    if (element) slotted.set(layout.slot, [...(slotted.get(layout.slot) ?? []), element]);
  }

  // The points draw their own surfaces: handed over after every render (a
  // countdown ticks, a count moves), and withdrawn when the overlay goes.
  useEffect(() => {
    board.publish(slotted);
  });
  useEffect(() => () => board.publish(new Map()), [board]);

  // What the diagnostics panel lists as drawn. Written only in debug mode
  // (`debug: true`); a release build never builds the list.
  const debugOn = client.debugOverlayEnabled;
  const drawnList: DrawnSurface[] = debugOn
    ? layouts.map(({ surface, layout }) => ({
        id: surface.id,
        type: surface.type,
        where:
          layout.mode === 'slot' && layout.slot
            ? 'point ' + layout.slot
            : layout.mode === 'dock'
              ? 'dock ' + layout.position
              : layout.mode,
      }))
    : [];
  const drawnSignature = debugOn ? drawnList.map((entry) => entry.id + '@' + entry.where).join(',') : '';
  useEffect(() => {
    if (!debugOn) return undefined;
    debugBoardOf(client).setSurfaces(screen.pageUrl, drawnList);
    return () => debugBoardOf(client).setSurfaces(null, []);
    // `drawnSignature` is the list; the effect is about it changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, debugOn, screen.pageUrl, drawnSignature]);
  return h(
    Fragment,
    null,
    // Safe-area insets, not a guessed constant: an announcement bar docked at
    // `top: 0` renders UNDER the status bar, so the merchant's copy collides
    // with the clock.
    top.length > 0
      ? h(View, { style: [sheet.dock, sheet.top, { paddingTop: insets.top }], pointerEvents: 'box-none' }, top.map((s) => renderSurface(s)))
      : null,
    bottom.length > 0
      ? h(
          View,
          {
            style: [sheet.dock, sheet.bottom, { paddingBottom: insets.bottom }],
            pointerEvents: 'box-none',
            onLayout: (event: { nativeEvent: { layout: { height: number } } }) => {
              const height = Math.round(event.nativeEvent.layout.height);
              setBottomDockHeight((previous) => (previous === height ? previous : height));
            },
          },
          bottom.map((s) => renderSurface(s))
        )
      : null,
    floating.map((surface) =>
      renderSurface(surface, { insets: { top: insets.top, bottom: bottomReserve(insets.bottom, bottomDockHeight, bottom.length > 0) } })
    ),
    modals.map((s) => renderSurface(s)),
    // Mounted whatever the list holds (nothing to draw is still a screen worth
    // explaining); it renders nothing unless the host asked for `debug: true`.
    h(SelwiseDebugOverlay, null)
  );
}

const sheet = StyleSheet.create({
  // `box-none` on the docks: the areas between surfaces must stay tappable, or
  // a full-width announcement bar would swallow taps on the app's own header.
  dock: { position: 'absolute', left: 0, right: 0, zIndex: 9999 },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
