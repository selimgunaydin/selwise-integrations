import {
  createElement as h,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ElementRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AppState,
  Dimensions,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSelwise, useSelwiseHost } from '../react/context.js';
import { useConfigVersion, useLocale, useScreen, useSelwiseReady } from '../react/use-selwise-state.js';
import type { RecommendationWidgetSummary, SelwiseProduct } from '../types.js';
import type { Strip } from '../core/strips.js';
import { isRecord } from '../core/records.js';
import { DEFAULT_LOOK_SETTINGS, type LookSettings } from '../vendor/look-settings.js';
import { AFTER_ADD_TOAST_LIMITS, afterAddSecondsOf, afterAddToastText, isAfterAddMode } from '../vendor/after-add.js';
import { shopperString } from '../vendor/shopper-strings.js';
import { SelwiseText as HeadingText, useBrandTheme, useIsFocusedFn, useNavigate } from './host-hooks.js';
import { getThemeTokens } from './styles.js';
import { createImpressionLedger, impressionBatch } from './strip-impressions.js';
import { stripFrameOf } from './strip-frame.js';
import { cardGap, phoneColumns, roleLanguage } from './strip-layout.js';
import { createVisibilityGate } from './strip-visibility.js';
import { appLanguage } from './strings.js';
import { Grid, List, Look, RoleTabs, Slider, type ViewBase } from './StripViews.js';
import { DefaultCard } from './card/DefaultCard.js';
import { VariantSheet } from './card/VariantSheet.js';
import type { AddAllOutcome } from './card/card-cart.js';
import {
  CardToastView,
  SurfaceCard,
  cardStateTexts,
  cardWishlist,
  firstCard,
  nonEmpty,
  useCardChooser,
  useCardEnvironment,
  useCardStyleContext,
  useCardToast,
} from './card/card-surface.js';
import { pickId } from './pick-ids.js';
import { SCREEN_STRIPS, useReportDrawnStrips } from './debug-board.js';
import { formatMoney } from './price-format.js';
import type { CardActions, CardEnv } from './card/card-env.js';

export { DefaultCard };

/**
 * A recommendation strip: the heading and container the merchant designed, the
 * display type they chose, and the product card from the card designer.
 *
 * ## Drawn as designed
 *
 * The frame (`strip-frame.ts`) and the display types (`StripViews.ts`) read the
 * strip's own settings — `titleStyles`, `subtitleStyles`, `containerStyles`,
 * `dotStyles`, `displayType`, `slidesPerViewMobile`, `slideGap`, `look` — and the
 * card (`card/ProductCard.ts`) reads the designer's element tree. All of it is
 * translated by the one style table the dashboard gates its fields by, painted
 * from the brand's tokens, and tested against the dashboard's own key lists, so
 * a field the dashboard shows on an app channel is one this draws.
 *
 * `renderItem` stays the escape: an app that already has a themed card passes it
 * and Selwise hands it a product, which is what the strip's layout, impressions
 * and clicks still wrap. The default card (no designed card, or one the app
 * cannot draw — merchant markup) is painted from the brand too.
 *
 * ## Impression and click are not optional
 *
 * Without them the widget's report shows zero impressions and the revenue it
 * drove is attributed to nothing, so the merchant concludes recommendations do
 * not work. A scrolling list reports what was actually on screen
 * (`onViewableItemsChanged`) rather than what was fetched; the other display
 * types report what they show once the strip has been on screen. An add to the
 * basket the host took is reported too, under the strip's id.
 */

// 60% visible before a card counts: one peeking in from the edge of the
// viewport has not been seen. A constant, like the callback: a FlatList refuses
// a new `viewabilityConfig` after mount.
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

/** The measured view: the container's full width, never its content's (see the `list` view). */
const LIST_FILLS_CONTAINER = { alignSelf: 'stretch', width: '100%' } as const;

/**
 * A product's price: the feed's own formatted text when it has one, else
 * `formatMoney` (the currency's own symbol, never a guessed one).
 */
export function formatPrice(
  product: Partial<SelwiseProduct> & { formattedPrice?: unknown; priceFormatted?: unknown },
  locale?: string | null,
): string {
  const formatted = product.formattedPrice || product.priceFormatted;
  if (formatted) return String(formatted);
  return formatMoney(product.price, product.currency, locale);
}

/**
 * The strip's place on the screen, sampled while it is mounted.
 *
 * `onOpen(true)` fires once the strip has been more than half on screen for a
 * second, `onOpen(false)` as soon as it is not — scrolled away, covered by
 * another screen (`isFocused() === false`) or the app in the background. See
 * `strip-visibility.ts` for why the FlatList's own viewability is not enough.
 * `untilOpen` stops sampling at the first `onOpen(true)`, for a caller that
 * records one sighting and nothing after it.
 */
export function useStripOnScreen(
  isFocused: () => boolean,
  onOpen: (open: boolean) => void,
  options: { untilOpen?: boolean } = {},
): RefObject<ElementRef<typeof View>> {
  const untilOpen = options.untilOpen === true;
  const ref = useRef<ElementRef<typeof View>>(null);
  const focused = useRef(isFocused);
  focused.current = isFocused;
  const notify = useRef(onOpen);
  notify.current = onOpen;

  useEffect(() => {
    const gate = createVisibilityGate();
    let wasOpen = false;

    const update = (open: boolean) => {
      if (open === wasOpen) return;
      wasOpen = open;
      notify.current(open);
      // A caller that needs only the first sighting stops measuring there:
      // each sample is a round trip to the native side.
      if (open && untilOpen) clearInterval(timer);
    };

    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      const away = AppState.currentState !== 'active' || focused.current() === false;
      const node = ref.current;
      if (away || !node || typeof node.measureInWindow !== 'function') {
        update(gate.sample(null, null, Date.now()));
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        update(gate.sample({ x, y, width, height }, Dimensions.get('window'), Date.now()));
      });
    }, 300);

    return () => clearInterval(timer);
  }, [untilOpen]);

  return ref;
}

export interface RenderItemInfo {
  product: SelwiseProduct;
  index: number;
  onPress: () => void;
  widget: RecommendationWidgetSummary;
}

/**
 * What a caller can hand to every strip it draws. `title` is deliberately not
 * among the shared ones: one heading for every strip of a screen is the
 * screen's choice, made per strip with `renderHeading`.
 */
export interface StripFrameProps {
  /** The app's own card. */
  renderItem?: (info: RenderItemInfo) => ReactElement | null;
  /** A product was tapped. The click is already reported. Without it the product's link opens through `host.navigate`. */
  onProductPress?: (product: SelwiseProduct, strip: Strip, index: number) => void;
  style?: StyleProp<ViewStyle>;
  headingStyle?: StyleProp<TextStyle>;
  renderHeading?: (info: { widget: RecommendationWidgetSummary; heading: string }) => ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  ItemSeparatorComponent?: ComponentType | null;
  /** A component put around the list — an app's own list-impression scope around the same cards. */
  listWrapper?: ComponentType<{ widget: RecommendationWidgetSummary; children?: ReactNode }>;
  /** `() => boolean`; false while another screen covers this one. Defaults to the host's. */
  isFocused?: () => boolean;
}

export interface RecommendationStripProps extends StripFrameProps {
  strip: Strip | null | undefined;
  /** A heading for this strip; otherwise the widget's own. */
  title?: string;
}

/** The product card this strip draws with: the phone's own, else the one the products answer carried, else the listing's. */
function cardOf(widget: Record<string, unknown>, productCard: Strip['productCard']): Record<string, unknown> | null {
  return firstCard(widget['mobileProductCard'], productCard, widget['productCard']);
}

const text = nonEmpty;

export function RecommendationStrip(props: RecommendationStripProps): ReactElement | null {
  const {
    strip,
    onProductPress,
    renderItem,
    title,
    style,
    headingStyle,
    renderHeading,
    contentContainerStyle,
    ItemSeparatorComponent,
    listWrapper,
    isFocused,
  } = props;
  const client = useSelwise();
  const host = useSelwiseHost();
  useBrandTheme();
  const navigate = useNavigate();
  const hostFocus = useIsFocusedFn();
  const locale = useLocale();
  const [width, setWidth] = useState(() => Dimensions.get('window').width);
  const { toast, show: showToast } = useCardToast();
  const { request, choose } = useCardChooser();
  const capSpent = useRef(false);

  // Hooks before the empty return: a strip that follows the basket goes from
  // products to none and back on the same mount, and a hook skipped on one
  // render is a React error on the next.
  const ledger = useRef(createImpressionLedger());
  const current = useRef(strip);
  current.current = strip;
  const widgetId = strip && strip.widget ? strip.widget.id : '';
  const viewable = useRef<SelwiseProduct[]>([]);
  const onScreen = useRef(false);

  // An impression needs the strip ON SCREEN and the card visible along it.
  const report = useCallback(() => {
    if (!onScreen.current) return;
    const fresh = impressionBatch(ledger.current, viewable.current, current.current);
    if (fresh.length === 0) return;
    // The strip is SHOWN now: its frequency-cap allowance is spent once.
    if (!capSpent.current && current.current) {
      capSpent.current = true;
      client.strips.recordShown(current.current);
    }
    // Counted because the strip is on screen and the card is half visible, and
    // said so: the dashboard keeps a click rate off a window that mixes this with
    // impressions counted at the draw.
    client.strips.trackImpression(widgetId, fresh, { basis: 'visible' });
  }, [client, widgetId]);

  const containerRef = useStripOnScreen(isFocused ?? hostFocus, (open) => {
    onScreen.current = open;
    if (open) report();
  });

  // One function for the life of the mount, reading the current `report`
  // through a ref: a FlatList refuses a new `onViewableItemsChanged` after
  // mount, and `report` changes with the widget as an A/B arm swaps it.
  const reportRef = useRef(report);
  reportRef.current = report;
  const onViewable = useRef((info: { viewableItems: Array<{ item?: unknown }> }) => {
    viewable.current = (info.viewableItems || []).map((entry) => entry.item as SelwiseProduct);
    reportRef.current();
  }).current;
  // The views that are not a scrolling list report what they show.
  const onShown = useRef((products: readonly SelwiseProduct[]) => {
    viewable.current = [...products];
    reportRef.current();
  }).current;

  // Everything below is memoised on what it really reads, and ALL of it runs
  // before the empty return (a hook skipped on one render is a React error on
  // the next). The card environment, the actions and `renderCard` keep their
  // identity across a toast, the option sheet, a basket change or a theme
  // event that moves nothing they read, so the cards (`React.memo`) and the
  // list's `renderItem` are not redrawn for them.
  const hasProducts = !!(strip && strip.products && strip.products.length > 0);
  const tokens = getThemeTokens();
  const language = appLanguage(locale);
  const stripWidget: Strip['widget'] | undefined = strip ? strip.widget : undefined;
  const stripCard = strip ? strip.productCard : null;
  const settings = useMemo(() => (stripWidget ?? {}) as Record<string, unknown>, [stripWidget]);

  // `width` is the trigger that has always refreshed the viewport: a rotation
  // changes the measured width of the strip.
  const ctx = useCardStyleContext(host.fontFamily, tokens, width);
  const frame = useMemo(() => (stripWidget ? stripFrameOf(stripWidget, ctx, title) : null), [stripWidget, ctx, title]);
  const card = useMemo(() => (stripWidget ? cardOf(settings, stripCard) : null), [stripWidget, settings, stripCard]);
  const config = useMemo(
    () => (isRecord(settings['addToCartConfig']) ? settings['addToCartConfig'] : {}),
    [settings]
  );
  const afterAdd = isAfterAddMode(config['afterAdd']) ? config['afterAdd'] : 'host';
  const canAdd = typeof host.addToCart === 'function';
  const currency = text(settings['currency']);

  // A host's `onProductPress` is usually an inline function: read through a
  // ref so a new one does not make a new set of actions.
  const pressHandler = useRef(onProductPress);
  pressHandler.current = onProductPress;

  const say = useCallback(
    (message: string, kind: 'success' | 'error', platformReason = false) => {
      // Selwise's own message is the strip's After add setting; `host` leaves the
      // saying to the app's basket, `quiet` says nothing. The platform's own
      // REASON for a refusal is the exception to `host`: the app's basket
      // handed it to the SDK to be shown (`SelwiseCartResult.message`), and a
      // refused add that says nothing is the defect (2026-11-18). `quiet` is
      // still silent.
      if (!message) return;
      if (platformReason ? afterAdd === 'quiet' : afterAdd !== 'toast') return;
      const seconds = (afterAddSecondsOf(config['afterAddSeconds']) ?? AFTER_ADD_TOAST_LIMITS.secondsDefault) + (kind === 'error' ? 2 : 0);
      showToast(message, kind, seconds);
    },
    [afterAdd, config, showToast]
  );

  const cardTexts = useMemo(() => cardStateTexts(card), [card]);
  const cartTexts = useMemo(
    () => ({
      default: text(config['buttonText']),
      loading: text(config['loadingText']),
      success: text(config['successText']),
      error: text(config['errorText']),
    }),
    [config]
  );

  /** One product into the host's basket; `quiet` is an add that is part of "add all" and says nothing by itself. */
  const addLine = useCallback(
    async (product: SelwiseProduct, code: string, quiet: boolean): Promise<boolean> => {
      if (!host.addToCart) return false;
      let answer: { success?: boolean; message?: string } | void | undefined;
      try {
        answer = await host.addToCart({ code, quantity: 1, source: 'recommendation', surfaceId: widgetId, product });
      } catch {
        answer = { success: false };
      }
      const ok = !(answer && answer.success === false);
      if (ok) {
        client.strips.trackAddToCart(widgetId, product.itemCode, {
          quantity: 1,
          price: product.price,
          currency: product.currency,
          productName: product.title,
          ...(afterAdd !== 'host' ? { afterAdd } : {}),
        });
      }
      const reason = !ok && answer && typeof answer.message === 'string' ? answer.message.trim() : '';
      if (!quiet) {
        say(
          ok
            ? afterAddToastText(
                text(config['afterAddMessage']),
                product.title,
                text(cardTexts['success']),
                cartTexts.success,
                shopperString('cart.toast.added', language)
              )
            : reason || shopperString('cart.toast.failed', language),
          ok ? 'success' : 'error',
          reason !== ''
        );
      }
      return ok;
    },
    [host, client, widgetId, afterAdd, config, cardTexts, cartTexts, language, say]
  );

  /** The app's favourites, when it has any: a card's heart asks, and an add is reported. */
  const wishlist = useMemo(
    () => cardWishlist(host, { source: 'recommendation', surfaceId: widgetId, onAdded: (product) => client.strips.trackWishlist(widgetId, product.itemCode) }),
    [host, client, widgetId]
  );

  const actions = useMemo<CardActions>(
    () => ({
      open: (product, index, url) => {
        client.strips.trackClick(widgetId, product.itemCode, index);
        const target = url || product.url;
        const handler = pressHandler.current;
        if (typeof handler === 'function' && (!url || url === product.url)) {
          handler(product, current.current as Strip, index);
        } else if (target) {
          void navigate({ url: target, source: 'recommendation', entityId: widgetId });
        }
      },
      add: (product, _index, code) => addLine(product, code, false),
      choose,
      say,
      ...(wishlist ? { wishlist } : {}),
    }),
    [client, widgetId, navigate, addLine, choose, say, wishlist]
  );

  const cart = useMemo<CardEnv['cart']>(
    () => ({
      ctaMode: settings['ctaMode'],
      addToCartEnabled: settings['addToCartEnabled'],
      canAdd,
      reviewButtonText: text(settings['reviewButtonText']),
      texts: cartTexts,
      cardTexts: {
        loading: text(cardTexts['loading']),
        success: text(cardTexts['success']),
        error: text(cardTexts['error']),
      },
    }),
    [settings, canAdd, cartTexts, cardTexts]
  );
  const { selection, rootText, env, defaultCardEnv } = useCardEnvironment({
    card,
    cart,
    actions,
    ctx,
    hostFont: host.fontFamily,
    tokens,
    currency,
    locale,
    language,
  });

  const press = useCallback(
    (product: SelwiseProduct, index: number) => actions.open(product, index, product.url),
    [actions]
  );

  const renderCard = useCallback(
    (product: SelwiseProduct, index: number): ReactElement | null =>
      typeof renderItem === 'function'
        ? renderItem({ product, index, onPress: () => press(product, index), widget: stripWidget as Strip['widget'] })
        : h(SurfaceCard, { product, index, env, defaultCardEnv, actions }),
    [renderItem, press, stripWidget, env, actions, defaultCardEnv]
  );

  // Stable, like `onViewable`: they are props of memoised views.
  const isOnScreen = useRef(() => onScreen.current).current;
  const addOne = useMemo(
    () => (canAdd ? (product: SelwiseProduct, code: string) => addLine(product, code, true) : null),
    [canAdd, addLine]
  );
  const onAddAll = useCallback((outcome: AddAllOutcome) => client.strips.trackAddAll(widgetId, outcome), [client, widgetId]);

  if (!strip || !stripWidget || !frame || !hasProducts) return null;
  const widget = stripWidget;

  // `displayType` absent (a strip a host built by hand) is the slider it always was; a name nobody draws is a grid, the storefront's default.
  const displayType = typeof settings['displayType'] === 'string' ? (settings['displayType'] as string) : 'slider';
  const columns = displayType === 'list' ? 1 : phoneColumns(settings);
  const gap = cardGap(settings);
  const base: ViewBase = {
    products: strip.products,
    width,
    columns,
    gap,
    renderCard,
    onShown,
  };
  const look: LookSettings = { ...DEFAULT_LOOK_SETTINGS, ...(isRecord(settings['look']) ? (settings['look'] as Partial<LookSettings>) : {}) };
  const textColor = rootText.color;

  let body: ReactElement;
  switch (displayType) {
    case 'slider':
    case 'carousel':
      body = h(Slider, {
        ...base,
        dots: frame.dots,
        autoplay: settings['autoplay'] === true,
        autoplaySpeed: Number(settings['autoplaySpeed']) || 3000,
        loop: settings['loop'] === true,
        isOnScreen,
        onViewable,
        viewabilityConfig: VIEWABILITY_CONFIG,
        ...(contentContainerStyle ? { contentContainerStyle } : {}),
        ...(ItemSeparatorComponent ? { ItemSeparatorComponent } : {}),
      });
      break;
    case 'list':
      body = h(List, base);
      break;
    case 'role_tabs':
      body = h(RoleTabs, { ...base, language: roleLanguage(locale), textColor });
      break;
    case 'look':
      body = h(Look, {
        ...base,
        settings: look,
        language: roleLanguage(locale),
        locale,
        ctx,
        textColor,
        selection,
        addOne,
        onAddAll,
      });
      break;
    default:
      body = h(Grid, base);
  }

  const container = isRecord(settings['containerStyles']) ? frame.container : { paddingVertical: 12, paddingHorizontal: 16 };
  const list = h(
    View,
    {
      ref: containerRef,
      collapsable: false,
      // The cards are sized by THIS view's measured width, so it must be the
      // container's width whatever its parent does: a parent that centres its
      // children (`margin: 0 auto` becomes `alignSelf: center`) would otherwise
      // wrap it to its own content, and the content is sized by the measure.
      style: LIST_FILLS_CONTAINER,
      onLayout: (event: { nativeEvent?: { layout?: { width?: number } } }) => {
        const measured = Math.floor(event?.nativeEvent?.layout?.width ?? 0);
        if (measured > 0 && measured !== width) setWidth(measured);
      },
    },
    body
  );

  const heading =
    typeof renderHeading === 'function'
      ? renderHeading({ widget, heading: frame.title?.text ?? '' })
      : frame.title
        ? h(HeadingText, { testID: pickId('title'), style: headingStyle || frame.title.style }, frame.title.text)
        : null;

  return h(
    View,
    { testID: pickId('container'), style: [container, { position: 'relative' }, style] },
    heading,
    frame.subtitle ? h(HeadingText, { testID: pickId('text'), style: frame.subtitle.style }, frame.subtitle.text) : null,
    listWrapper ? h(listWrapper, { widget }, list) : list,
    h(CardToastView, { toast, tokens, position: config['afterAddPosition'] === 'top' ? 'top' : 'bottom' }),
    h(VariantSheet, {
      request,
      window: env?.tree.variantModal ?? null,
      chooser: env?.tree.variantChooser ?? null,
      ctx,
      currency,
      locale,
      language,
    })
  );
}

/**
 * A strip that follows the basket ("complete to free shipping"): asked when it
 * mounts and again whenever the basket moves, through the client's strip service
 * (`strips.follow`). Draws nothing while it has nothing to say — an unmeasured
 * basket, or one already past the threshold.
 */
function CartStrip(props: RecommendationStripProps & { strip: Strip; context?: unknown }): ReactElement {
  const client = useSelwise();
  const { strip, context } = props;
  const [shown, setShown] = useState<Strip>(strip);
  const contextKey = JSON.stringify(context || {});

  useEffect(
    () => client.strips.follow(strip, context || {}, setShown),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, strip.widget.id, contextKey]
  );

  return h(RecommendationStrip, { ...props, strip: shown });
}

const STRIP_PROPS: ReadonlyArray<keyof StripFrameProps> = [
  'renderItem',
  'onProductPress',
  'style',
  'headingStyle',
  'renderHeading',
  'contentContainerStyle',
  'ItemSeparatorComponent',
  'listWrapper',
  'isFocused',
];

function stripPropsOf(props: StripFrameProps): StripFrameProps {
  const out: Record<string, unknown> = {};
  for (const key of STRIP_PROPS) {
    if (props[key] !== undefined) out[key] = props[key];
  }
  return out as StripFrameProps;
}

/** The strips as elements: one that follows the basket through the client, the rest as they are. */
export function drawStrips(strips: readonly Strip[], props: StripFrameProps & { context?: unknown }): ReactElement[] {
  const passed = stripPropsOf(props);
  return strips.map((strip) =>
    strip.followsCart
      ? h(CartStrip, { key: strip.widget.id, strip, context: props.context, ...passed })
      : h(RecommendationStrip, { key: strip.widget.id, strip, ...passed })
  );
}

export interface RecommendationStripsProps extends StripFrameProps {
  /**
   * The screen's address (`app://product`). Defaults to the screen the host
   * last named — fine on the one screen in front of the shopper, wrong on a
   * screen that stays mounted behind another, so name it.
   */
  screen?: string;
  /** What the screen knows, for the strips that need it: `{ currentProductId }` on a product screen. */
  context?: Record<string, unknown>;
}

/** Every strip a screen has, in the order the merchant placed them. */
export function RecommendationStrips(props: RecommendationStripsProps): ReactElement | null {
  const client = useSelwise();
  const ready = useSelwiseReady();
  const current = useScreen();
  const locale = useLocale();
  // A strip published while the app is open (`on('config')`).
  const configVersion = useConfigVersion();
  const screen = props.screen ?? current.pageUrl;
  const { context } = props;
  const [strips, setStrips] = useState<Strip[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!ready || !screen) {
      setStrips((previous) => (previous.length === 0 ? previous : []));
      return undefined;
    }

    client.strips
      .strips(screen, context || {}, { followCart: true })
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
  }, [client, ready, screen, locale, configVersion, JSON.stringify(context || {})]);

  useReportDrawnStrips(client, screen ?? '', SCREEN_STRIPS, strips);
  if (strips.length === 0) return null;

  return h(Fragment, null, drawStrips(strips, props));
}
