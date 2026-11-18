import { Component, createElement as h, Fragment, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSelwise } from '../react/context.js';
import { useConfigVersion, useExperimentsVersion, useLocale, useScreen, useSelwiseReady } from '../react/use-selwise-state.js';
import { normalizeContext, readsLiveCart, type Strip, type StripEntry } from '../core/strips.js';
import { screenKey, slotArmEnrichment, slotArmStrip, type ScreenSlotArm } from '../core/screen-slot.js';
import { SelwiseEnrichment } from './SelwiseEnrichment.js';
import { drawStrips, useStripOnScreen, type StripFrameProps } from './RecommendationStrip.js';
import { useIsFocusedFn } from './host-hooks.js';
import { slotOfWidget, slotsOf } from './slots.js';
import { boardOf, useBoardDrawn, type SurfaceBoard } from './surface-board.js';
import { useReportDrawnStrips } from './debug-board.js';

/**
 * One named point on a screen: the campaigns and the strips the merchant sent
 * there from the dashboard, and (on a product screen) the product enrichment
 * blocks placed at the same name.
 *
 * A campaign placed in a point (an announcement bar inside the product screen, a
 * counter under the price, an inline newsletter) is drawn here and nowhere else:
 * `<SelwiseSurfaces>` decides it and counts it, this point draws it. A campaign
 * sent to a point the app never mounted is not drawn — it does not fall back to
 * a bar at the top of the screen — and is not counted.
 *
 * ```jsx
 * <SelwiseSlot
 *   screen="app://product"
 *   slot="pdp-under-info"
 *   sku={product.sku}
 *   context={{ currentProductId: product.sku }}
 *   renderItem={({ product, onPress }) => <MyCard product={product} onPress={onPress} />}
 * />
 * ```
 *
 * ## What is and is not code
 *
 * Mounting the point is the app's one-time work. Everything after is the
 * dashboard: which screen (page targeting), which point (the strip's container
 * selector — the dashboard writes `[data-selwise-slot="pdp-under-info"]` for an
 * app channel), what is drawn (strategy, heading, segment, experiment, test
 * mode). The names an app can mount are in `slots.ts`.
 *
 * ## A screen experiment can own the point
 *
 * When the dashboard runs a SCREEN experiment on this point, a visitor in it gets
 * the arm's module here — a strip, an enrichment block, a campaign, or nothing —
 * INSTEAD of what the point's own targeting would have drawn (`core/screen-slot.ts`
 * has the rule: the point draws the arm or the native content, never both). The
 * point draws nothing until it knows which (`client.resolveScreenSlot`; the arms
 * are one request per launch that every strip already waits for), so the native
 * content is never drawn and then replaced. The arm's exposure is recorded when the
 * point is on the shopper's screen — a one-point probe at its top, visible for a
 * second with the app in front, the same moment for EVERY arm, the one that
 * shows nothing included — never when it is only mounted below the fold.
 *
 * ## Behaviour a mount point must not get wrong
 *
 * - Points on one screen share ONE request for the list of strips, and each
 *   asks for the products of ITS strips only: asked on their own, the widget
 *   list and every strip's products would be fetched once per point.
 * - It draws nothing — and fetches nothing — on a product screen until the
 *   product code is known. `similar_products` without its anchor recommends
 *   the product being looked at.
 * - A render error stays inside the point. A strip is worth less than the
 *   product page it sits on.
 * - An impression needs the strip on screen (`strip-visibility.ts`), not just
 *   mounted in a scroll view below the fold.
 */

export interface SelwiseSlotProps extends StripFrameProps {
  /**
   * The screen's address (`app://product`). Defaults to the screen the host
   * last named — fine on the one screen in front of the shopper, wrong on a
   * screen that stays mounted behind another, so name it.
   */
  screen?: string;
  /** The point (`pdp-under-info`); the names an app can mount are `SCREEN_SLOTS`. */
  slot: string;
  /** The product's item code: also draws the enrichment placed at this name. */
  sku?: string;
  /** What the screen knows, for the strips that need it: `{ currentProductId }` on a product screen. */
  context?: Record<string, unknown>;
  /** Says in the log when the point is not one of this screen's, and when a render fails. */
  debug?: boolean;
}

class SlotBoundary extends Component<{ debug?: boolean; children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (this.props.debug) {
      // eslint-disable-next-line no-console
      console.log('[Selwise] slot failed to render: ' + ((error as Error | undefined)?.message || String(error)));
    }
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Tell the client this point exists in the app, once per mount. The dashboard
 * then shows it as connected, and a strip or a campaign sent to a point nobody
 * mounted as the one that cannot appear. Never throws: the point works the same
 * without it.
 *
 * It also tells the overlay (`surface-board.ts`): a campaign sent to this point
 * is drawn only while the point is mounted, and the point it returns is how the
 * point later says whether it is on the shopper's screen.
 */
function useMountSlot(slot: string): { board: SurfaceBoard; token: symbol | null } {
  const client = useSelwise();
  const board = boardOf(client);
  const [token, setToken] = useState<symbol | null>(null);
  useEffect(() => {
    try {
      client.registerSlot(slot);
    } catch {
      // A report is a courtesy.
    }
  }, [client, slot]);
  useEffect(() => {
    const mounted = board.mount(slot);
    setToken(mounted.token);
    return () => {
      mounted.unmount();
      setToken(null);
    };
  }, [board, slot]);
  return { board, token };
}

/**
 * The campaigns the merchant sent to this point (an announcement bar inside the
 * product screen, a counter under the price, an inline newsletter), as the
 * overlay drew them. The point reports whether it is on the shopper's screen —
 * more than half of it, for a second, with the app in front — and the overlay
 * counts the impression then, not when the screen opened with the point below
 * the fold.
 */
function SlotSurfaces(props: { board: SurfaceBoard; slot: string; token: symbol | null; isFocused?: () => boolean }): ReactElement | null {
  const { board, slot } = props;
  useBoardDrawn(board);
  const items = board.drawnAt(slot);
  // The sampler runs only while something is drawn here.
  return items.length === 0 ? null : h(SlotItems, { ...props, items });
}

function SlotItems(props: {
  board: SurfaceBoard;
  slot: string;
  token: symbol | null;
  items: readonly ReactElement[];
  isFocused?: () => boolean;
}): ReactElement {
  const { board, slot, token, items } = props;
  const hostFocus = useIsFocusedFn();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const ref = useStripOnScreen(props.isFocused ?? hostFocus, (open) => {
    if (tokenRef.current) board.setOnScreen(slot, tokenRef.current, open);
  });
  useEffect(
    () => () => {
      if (tokenRef.current) board.setOnScreen(slot, tokenRef.current, false);
    },
    [board, slot]
  );
  return h(View, { ref, collapsable: false }, ...items);
}

function SlotStrips(props: SelwiseSlotProps & { screen: string }): ReactElement | null {
  const { screen, slot, context } = props;
  const client = useSelwise();
  const ready = useSelwiseReady();
  const locale = useLocale();
  // A strip published while the app is open (`on('config')`).
  const configVersion = useConfigVersion();
  const [strips, setStrips] = useState<Strip[]>([]);
  const contextKey = JSON.stringify(context || {});
  const waitingForProduct = screen.toLowerCase() === 'app://product' && !normalizeContext(context).currentProductId;

  useEffect(() => {
    let cancelled = false;
    if (!ready || waitingForProduct) {
      setStrips((previous) => (previous.length === 0 ? previous : []));
      return undefined;
    }

    client.strips
      .strips(screen, context || {}, {
        followCart: true,
        // Before any products are asked for: a point fetches its own strips and no other.
        only: (entry) => slotOfWidget(entry.listed, screen) === slot,
      })
      .then((result) => {
        if (!cancelled) setStrips(result);
      })
      .catch(() => {
        if (!cancelled) setStrips([]);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ready, screen, slot, contextKey, waitingForProduct, locale, configVersion]);

  useReportDrawnStrips(client, screen, slot, strips);
  if (strips.length === 0) return null;
  return h(Fragment, null, drawStrips(strips, props));
}

/**
 * The visitor's arm of the screen experiment that owns this point:
 * `undefined` while it is being asked (draw nothing yet), `null` when no
 * experiment owns the point (draw it as targeting says), else the arm.
 * Asked again when the screen, the point or the arms change; a failure is `null`
 * — the point as it was, never a hidden one.
 */
function useSlotArm(screen: string, slot: string): ScreenSlotArm | null | undefined {
  const client = useSelwise();
  const ready = useSelwiseReady();
  const version = useExperimentsVersion();
  const key = screenKey(screen) + '|' + slot + '|' + version;
  const [resolved, setResolved] = useState<{ key: string; arm: ScreenSlotArm | null } | null>(null);

  useEffect(() => {
    if (!ready || !screen) return undefined;
    let cancelled = false;
    client
      .resolveScreenSlot(screen, slot)
      .then((arm) => {
        if (!cancelled) setResolved({ key, arm });
      })
      .catch(() => {
        if (!cancelled) setResolved({ key, arm: null });
      });
    return () => {
      cancelled = true;
    };
    // `key` is the question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ready, key]);

  // With no screen there is no experiment to ask about.
  if (!screen) return null;
  return resolved && resolved.key === key ? resolved.arm : undefined;
}

/**
 * The exposure probe: one point at the top of the point, which counts the arm
 * as exposed once it has been visible for a second with the app in front
 * (`useStripOnScreen`, the strips' own rule). A probe rather than the arm's
 * content so the arm that draws nothing — and one whose strip came back empty —
 * is counted at the same moment as the arms that draw a lot.
 */
function SlotExposure(props: { arm: ScreenSlotArm; isFocused?: () => boolean }): ReactElement {
  const client = useSelwise();
  const hostFocus = useIsFocusedFn();
  const armRef = useRef(props.arm);
  armRef.current = props.arm;
  // One exposure per arm per process (`trackScreenSlotExposure`): stop at the first.
  const ref = useStripOnScreen(
    props.isFocused ?? hostFocus,
    (open) => {
      if (open) client.trackScreenSlotExposure(armRef.current);
    },
    { untilOpen: true },
  );
  return h(View, { ref, collapsable: false, pointerEvents: 'none', style: sheet.probe });
}

/** The strip an arm draws at the point, with its products; nothing while it has none. */
function SlotArmStrip(props: SelwiseSlotProps & { screen: string; arm: ScreenSlotArm }): ReactElement | null {
  const { screen, arm, context } = props;
  const client = useSelwise();
  const ready = useSelwiseReady();
  const locale = useLocale();
  const [strips, setStrips] = useState<Strip[]>([]);
  const contextKey = JSON.stringify(context || {});
  const waitingForProduct = screenKey(screen) === 'app://product' && !normalizeContext(context).currentProductId;

  useEffect(() => {
    let cancelled = false;
    const summary = slotArmStrip(arm);
    if (!ready || waitingForProduct || !summary) {
      setStrips((previous) => (previous.length === 0 ? previous : []));
      return undefined;
    }
    // Before the products are asked for: the strip's impressions and clicks are
    // the experiment's while this point draws it.
    const release = client.registerSlotArmStrip(arm);
    const entry: StripEntry = {
      listed: summary,
      widget: summary,
      follows: arm.assignment.liveCartRequired === true || readsLiveCart(summary),
    };
    client.strips
      .strip(entry, context || {}, { followCart: true })
      .then((strip) => {
        if (!cancelled) setStrips(strip ? [strip] : []);
      })
      .catch(() => {
        if (!cancelled) setStrips([]);
      });
    return () => {
      cancelled = true;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ready, arm.experimentId, arm.variantId, contextKey, waitingForProduct, locale]);

  useReportDrawnStrips(client, screen, props.slot, strips);
  if (strips.length === 0) return null;
  return h(Fragment, null, drawStrips(strips, props));
}

/** The point owned by a screen experiment: the probe, then what the arm draws. */
function ArmSlot(
  props: SelwiseSlotProps & { screen: string; arm: ScreenSlotArm; board: SurfaceBoard; token: symbol | null }
): ReactElement {
  const { arm, board, slot, token, sku } = props;
  const client = useSelwise();
  const enrichment = slotArmEnrichment(arm);
  return h(
    Fragment,
    null,
    h(SlotExposure, { arm, ...(props.isFocused ? { isFocused: props.isFocused } : {}) }),
    // A campaign arm: the overlay decided it and published it at this point
    // (`getSurfaces` withheld the native campaigns of a claimed point).
    h(SlotSurfaces, { board, slot, token, ...(props.isFocused ? { isFocused: props.isFocused } : {}) }),
    arm.module.kind === 'recommendation' ? h(SlotArmStrip, props) : null,
    arm.module.kind === 'enrichment' && enrichment && sku
      ? h(SelwiseEnrichment, {
          code: sku,
          slot: enrichment.placementKey,
          only: enrichment.id,
          onPress: () => client.trackScreenSlotClick(arm),
        })
      : null
  );
}

export function SelwiseSlot(props: SelwiseSlotProps): ReactElement {
  const { slot, sku } = props;
  const current = useScreen();
  const screen = props.screen ?? current.pageUrl ?? '';
  const { board, token } = useMountSlot(slot);
  const arm = useSlotArm(screen, slot);

  if (props.debug && !slotsOf(screen).includes(slot)) {
    // eslint-disable-next-line no-console
    console.log('[Selwise] "' + slot + '" is not a slot of ' + (screen || 'an unnamed screen'));
  }

  return h(
    SlotBoundary,
    { debug: props.debug },
    // Not asked yet: nothing, so what a screen experiment replaces is never drawn first.
    arm === undefined
      ? null
      : arm
        ? h(ArmSlot, { ...props, screen, arm, board, token })
        : h(
            Fragment,
            null,
            // The campaigns the merchant sent here, above the strips and the enrichment.
            h(SlotSurfaces, { board, slot, token, ...(props.isFocused ? { isFocused: props.isFocused } : {}) }),
            sku ? h(SelwiseEnrichment, { code: sku, slot, probe: true }) : null,
            screen ? h(SlotStrips, { ...props, screen }) : null
          )
  );
}

const sheet = StyleSheet.create({
  // One point high and full width: visible whenever the top of the point is.
  probe: { height: 1, width: '100%' },
});
