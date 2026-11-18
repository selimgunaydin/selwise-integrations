import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { parseColor, type AppStyleContext } from '../vendor/app-style.js';
import { shopperString } from '../vendor/shopper-strings.js';
import type { LookSettings } from '../vendor/look-settings.js';
import type { SelwiseProduct } from '../types.js';
import { formatMoney } from './price-format.js';
import { asText, asView } from './style-cast.js';
import { addAllSequentially, decideAddAllLine, type AddAllOutcome, type VariantSelection } from './card/card-cart.js';
import {
  cardWidth,
  chunkRows,
  lookCaption,
  lookTotal,
  pageAtOffset,
  pageCount,
  roleTabs,
  stepPage,
} from './strip-layout.js';
import type { StripDotsView } from './strip-frame.js';

/**
 * The display types of a recommendation strip, drawn: a slider, a grid, a list,
 * tabs by role and a look.
 *
 * Each view lays out cards it is handed (`renderCard`) — the designer's card or
 * the default one — and knows nothing of the host, the basket or tracking: the
 * strip owns those. What each does is the storefront's (`recommendation/renderers`)
 * on a phone: a slider shows `slidesPerViewMobile` cards per screen width with
 * `slideGap` between them and one dot per PAGE; a grid fills rows of that many;
 * a list stacks full-width cards; tabs show one role's cards at a time; a look
 * captions each card, totals the prices and offers "add all".
 */

export interface ViewBase {
  products: readonly SelwiseProduct[];
  /** The width the cards share, as measured. */
  width: number;
  columns: number;
  gap: number;
  renderCard(product: SelwiseProduct, index: number): ReactElement | null;
  /** What this view shows on screen right now (the strip counts those as seen). */
  onShown(products: readonly SelwiseProduct[]): void;
}

const keyOf = (product: SelwiseProduct, index: number): string => String(product.itemCode || index);

/* ----------------------------------------------------------------------------
   Slider
   -------------------------------------------------------------------------- */

export interface SliderProps extends ViewBase {
  dots: StripDotsView | null;
  autoplay: boolean;
  autoplaySpeed: number;
  loop: boolean;
  /** Whether the strip is on screen: a slider that nobody sees does not turn. */
  isOnScreen(): boolean;
  /** The list's own viewability reading (`onViewableItemsChanged`), unchanged since before the display types. */
  onViewable: (info: { viewableItems: Array<{ item?: unknown }> }) => void;
  viewabilityConfig: { itemVisiblePercentThreshold: number };
  contentContainerStyle?: StyleProp<ViewStyle>;
  ItemSeparatorComponent?: ComponentType | null;
}

export function Slider(props: SliderProps): ReactElement {
  const { products, width, columns, gap, dots, renderCard } = props;
  const slide = cardWidth(width, columns, gap);
  const pageWidth = columns * (slide + gap);
  const pages = pageCount(products.length, columns);
  const [page, setPage] = useState(0);
  const list = useRef<{ scrollToOffset?: (options: { offset: number; animated?: boolean }) => void } | null>(null);
  // Autoplay waits while a finger is on the list, as the web's does while the pointer is over it.
  const touching = useRef(false);

  const pageRef = useRef(page);
  const goTo = useCallback(
    (next: number) => {
      pageRef.current = next;
      setPage(next);
      list.current?.scrollToOffset?.({ offset: next * pageWidth, animated: true });
    },
    [pageWidth]
  );

  const onScreen = useRef(props.isOnScreen);
  onScreen.current = props.isOnScreen;
  useEffect(() => {
    if (!props.autoplay || pages < 2) return undefined;
    const timer = setInterval(() => {
      if (touching.current || !onScreen.current()) return;
      goTo(stepPage(pageRef.current, pages, 'next', props.loop));
    }, Math.max(500, props.autoplaySpeed));
    return () => clearInterval(timer);
  }, [props.autoplay, props.autoplaySpeed, props.loop, pages, goTo]);

  // Component identities, kept: a separator type made on every render is a new
  // component to React (every separator remounts) and a new `renderItem` redraws every visible cell.
  const gapSeparator = useMemo(() => () => h(View, { style: { width: gap } }), [gap]);
  const separator = props.ItemSeparatorComponent ?? gapSeparator;
  const renderItem = useCallback(
    (entry: { item: SelwiseProduct; index: number }) =>
      h(View, { style: { width: slide } }, renderCard(entry.item, entry.index)),
    [slide, renderCard]
  );
  const row = h(FlatList<SelwiseProduct>, {
    ref: list as never,
    data: products as SelwiseProduct[],
    horizontal: true,
    showsHorizontalScrollIndicator: false,
    keyExtractor: keyOf,
    contentContainerStyle: props.contentContainerStyle,
    ItemSeparatorComponent: separator,
    snapToInterval: columns > 0 && pageWidth > 0 ? pageWidth : undefined,
    decelerationRate: 'fast',
    viewabilityConfig: props.viewabilityConfig,
    onViewableItemsChanged: props.onViewable,
    onScrollBeginDrag: () => {
      touching.current = true;
    },
    onScrollEndDrag: () => {
      touching.current = false;
    },
    onMomentumScrollEnd: (event: { nativeEvent?: { contentOffset?: { x?: number } } }) => {
      const at = pageAtOffset(event?.nativeEvent?.contentOffset?.x ?? 0, pageWidth, pages);
      pageRef.current = at;
      setPage(at);
    },
    renderItem,
  });

  return h(
    View,
    null,
    row,
    dots
      ? h(
          View,
          { style: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: dots.gap, marginTop: dots.offset }, testID: 'selwise-dots' },
          ...Array.from({ length: pages }, (_unused, at) =>
            h(Pressable, {
              key: at,
              accessibilityRole: 'button',
              accessibilityLabel: String(at + 1),
              onPress: () => goTo(at),
              hitSlop: 6,
              style: {
                width: dots.width,
                height: dots.height,
                borderRadius: dots.radius,
                backgroundColor: at === page ? dots.activeColor : dots.color,
              },
            })
          )
        )
      : null
  );
}

/* ----------------------------------------------------------------------------
   Grid and list
   -------------------------------------------------------------------------- */

/** Rows of `columns` cards of one width, so a short last row lines up with the rows above it. */
export function Grid(props: ViewBase & { cell?: (product: SelwiseProduct, index: number) => ReactNode }): ReactElement {
  const { products, width, columns, gap, renderCard } = props;
  const size = cardWidth(width, columns, gap);
  useEffect(() => props.onShown(products), [products]); // eslint-disable-line react-hooks/exhaustive-deps
  let at = 0;
  return h(
    View,
    { style: { gap } },
    ...chunkRows(products, columns).map((row, rowAt) =>
      h(
        View,
        { key: rowAt, style: { flexDirection: 'row', gap } },
        ...row.map((product) => {
          const index = at;
          at += 1;
          return h(View, { key: keyOf(product, index), style: { width: size } }, props.cell ? props.cell(product, index) : renderCard(product, index));
        })
      )
    )
  );
}

/** Full-width cards, one under another: a phone reads a list as a stack, not as image beside text. */
export function List(props: ViewBase): ReactElement {
  const { products, gap, renderCard } = props;
  useEffect(() => props.onShown(products), [products]); // eslint-disable-line react-hooks/exhaustive-deps
  return h(
    View,
    { style: { gap } },
    ...products.map((product, index) => h(View, { key: keyOf(product, index) }, renderCard(product, index)))
  );
}

/* ----------------------------------------------------------------------------
   Role tabs
   -------------------------------------------------------------------------- */

export function RoleTabs(props: ViewBase & { language: 'tr' | 'en'; textColor: string }): ReactElement {
  const tabs = roleTabs(props.products, props.language);
  const [active, setActive] = useState(0);
  // No role on any product (another strategy): the plain grid, never an empty view.
  if (tabs.length === 0) return h(Grid, props);
  const current = tabs[Math.min(active, tabs.length - 1)]!;
  return h(
    View,
    null,
    h(
      ScrollView,
      { horizontal: true, showsHorizontalScrollIndicator: false, style: { marginBottom: props.gap }, contentContainerStyle: { gap: 8 } },
      ...tabs.map((tab, at) =>
        h(
          Pressable,
          {
            key: tab.role,
            accessibilityRole: 'tab',
            accessibilityState: { selected: at === active },
            onPress: () => setActive(at),
            style: {
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: props.textColor,
              opacity: at === active ? 1 : 0.7,
            },
          },
          h(Text, { style: { color: props.textColor, fontWeight: at === active ? '600' : '400' } }, tab.label)
        )
      )
    ),
    h(Grid, { ...props, key: current.role, products: current.products })
  );
}

/* ----------------------------------------------------------------------------
   Look
   -------------------------------------------------------------------------- */

const TOTAL_SIZE: Record<string, number> = { sm: 13, md: 14, lg: 20 };
const TOTAL_WEIGHT: Record<string, string> = { normal: '400', semibold: '600', bold: '700' };
const BUTTON_SIZE: Record<string, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: 6, paddingHorizontal: 12, fontSize: 13 },
  md: { paddingVertical: 10, paddingHorizontal: 18, fontSize: 14 },
  lg: { paddingVertical: 14, paddingHorizontal: 26, fontSize: 15 },
};
const ALIGN: Record<string, 'flex-start' | 'center' | 'flex-end' | 'stretch'> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

function tokenOf(ctx: AppStyleContext, name: string, literal: string): string {
  const raw = ctx.tokens?.[name] ?? ctx.tokens?.[name.replace(/^--/, '')];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : literal;
}

/** The look's total, as designed (`look.total*`): its words, layout, alignment, size, weight and colours. */
function lookTotalStyles(settings: LookSettings, ctx: AppStyleContext, textColor: string) {
  const color = parseColor(settings.totalColor, ctx) ?? textColor;
  const background = parseColor(settings.totalBackground, ctx);
  const radius = Number.parseFloat(tokenOf(ctx, '--selwise-radius', '8')) || 0;
  const align = ALIGN[settings.totalAlign] ?? 'flex-start';
  const split = settings.totalLayout === 'split';
  const stacked = settings.totalLayout === 'stacked';
  return {
    box: {
      flexDirection: stacked ? 'column' : 'row',
      flexWrap: 'wrap',
      alignItems: stacked ? align : 'baseline',
      justifyContent: split ? 'space-between' : align,
      alignSelf: split ? 'stretch' : align,
      gap: stacked ? 2 : 5,
      ...(background ? { backgroundColor: background, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius } : {}),
    },
    text: {
      color,
      fontSize: TOTAL_SIZE[settings.totalSize] ?? 14,
      fontWeight: TOTAL_WEIGHT[settings.totalWeight] ?? '600',
    },
  };
}

/** The add-all button, as designed (`look.addAll*`): variant, shape, size, alignment and colours. */
function lookButtonStyles(settings: LookSettings, ctx: AppStyleContext) {
  const brand = tokenOf(ctx, '--selwise-brand', '#111111');
  const brandText = tokenOf(ctx, '--selwise-brand-text', '#ffffff');
  const fill = parseColor(settings.addAllColor, ctx) ?? brand;
  const label = parseColor(settings.addAllTextColor, ctx);
  const radius = Number.parseFloat(tokenOf(ctx, '--selwise-radius', '8')) || 0;
  const variant = settings.addAllVariant;
  const size = BUTTON_SIZE[settings.addAllSize] ?? BUTTON_SIZE['md']!;
  return {
    box: {
      alignSelf: ALIGN[settings.addAllAlign] ?? 'flex-start',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: size.paddingVertical,
      paddingHorizontal: size.paddingHorizontal,
      borderRadius: settings.addAllShape === 'square' ? 0 : settings.addAllShape === 'pill' ? 999 : radius,
      borderWidth: 1,
      borderColor: variant === 'text' ? 'transparent' : fill,
      backgroundColor: variant === 'solid' ? fill : 'transparent',
    },
    text: {
      fontSize: size.fontSize,
      fontWeight: '600',
      color: variant === 'solid' ? (label ?? brandText) : (label ?? fill),
      ...(variant === 'text' ? { textDecorationLine: 'underline' } : {}),
    },
  };
}

export interface LookProps extends ViewBase {
  settings: LookSettings;
  language: 'tr' | 'en';
  locale: string | undefined;
  ctx: AppStyleContext;
  textColor: string;
  selection: VariantSelection;
  /** Null when the host cannot add to a basket: the button is then not drawn. */
  addOne: ((product: SelwiseProduct, code: string) => Promise<boolean>) | null;
  /** One press of "add all", reported. */
  onAddAll(outcome: AddAllOutcome): void;
}

/** "3 of 4 added to the basket · choose a size for 1": what an add-all press came to. */
export function describeAddAll(outcome: AddAllOutcome, language: string): string {
  const parts = [shopperString('addAll.added', language, { added: outcome.added, requested: outcome.requested })];
  if (outcome.needsSize > 0) parts.push(shopperString('addAll.needsSize', language, { count: outcome.needsSize }));
  if (outcome.failed > 0) parts.push(shopperString('addAll.failed', language, { count: outcome.failed }));
  return parts.join(' · ');
}

export function Look(props: LookProps): ReactElement {
  const { products, settings, language, ctx, textColor } = props;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  // Not a look (no product carries a role): the plain grid, as the storefront draws it.
  if (!products.some((product) => product.complement)) return h(Grid, props);

  const total = settings.showTotal ? lookTotal(products) : null;
  const totalStyles = lookTotalStyles(settings, ctx, textColor);
  const buttonStyles = lookButtonStyles(settings, ctx);
  const totalLabel = settings.totalLabel || shopperString('look.total', language);
  const addAllLabel = settings.addAllLabel || shopperString('look.addAll', language);
  const canAddAll = settings.showAddAll && products.length > 1 && props.addOne !== null;

  const press = async () => {
    if (busy || !props.addOne) return;
    setBusy(true);
    setStatus('');
    try {
      const add = props.addOne;
      const outcome = await addAllSequentially(products, (product) => decideAddAllLine(product, props.selection), (product, code) => add(product, code));
      props.onAddAll(outcome);
      setStatus(describeAddAll(outcome, language));
    } finally {
      setBusy(false);
    }
  };

  return h(
    View,
    null,
    h(Grid, {
      ...props,
      cell: (product, index) =>
        h(
          View,
          null,
          props.renderCard(product, index),
          lookCaption(product, language, settings.caption)
            ? h(Text, { style: { marginTop: 6, fontSize: 12, opacity: 0.75, color: textColor } }, lookCaption(product, language, settings.caption))
            : null
        ),
    }),
    total
      ? h(
          View,
          { style: asView({ marginTop: props.gap, ...totalStyles.box }), testID: 'selwise-look-total' },
          h(Text, { style: asText(totalStyles.text) }, settings.totalLayout === 'inline' ? `${totalLabel}:` : totalLabel),
          h(Text, { style: asText(totalStyles.text) }, formatMoney(total.sum, total.currency, props.locale))
        )
      : null,
    canAddAll
      ? h(
          View,
          { style: { marginTop: 12, gap: 8 } },
          h(
            Pressable,
            { accessibilityRole: 'button', disabled: busy, onPress: press, style: asView({ ...buttonStyles.box, ...(busy ? { opacity: 0.6 } : {}) }), testID: 'selwise-look-add-all' },
            h(Text, { style: asText(buttonStyles.text) }, addAllLabel)
          ),
          status ? h(Text, { style: { fontSize: 13, color: textColor }, accessibilityLiveRegion: 'polite' }, status) : null
        )
      : null,
  );
}
