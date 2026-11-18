import { createElement as h, useEffect, useState, type ReactElement } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { shopperString } from '../../vendor/shopper-strings.js';
import { parseColor, type AppStyleContext, type NativeStyle } from '../../vendor/app-style.js';
import {
  resolveInitialVariant,
  variantLabel,
  variantModalPriceFor,
  type CardVariant,
} from '../../vendor/product-card-variant-logic.js';
import type { SelwiseProduct } from '../../types.js';
import { SelwiseImage } from '../host-hooks.js';
import { asText, asView } from '../style-cast.js';
import { formatMoney } from '../price-format.js';

/**
 * The "choose an option" sheet: the product's picture and name, its sizes, and
 * the button — what the storefront's window shows
 * (`renderVariantModal`), as a native bottom sheet.
 *
 * ONE implementation for the three ways a card can offer options (`chips`,
 * `dropdown`, `modal`): a phone has no room for a row of size buttons on a card,
 * and a dropdown is a desktop control. The card's own settings still apply — the
 * window's (`cardTree.variantModal`: placement, width, corners, picture, price,
 * colours, "add as soon as one is chosen") and the chooser's
 * (`cardTree.variantChooser`: the chips' shape, size, weight, colours, how a
 * sold-out one is shown).
 *
 * A sold-out option stays listed but cannot be chosen: knowing a size exists and
 * is gone is information. Nothing is added by the sheet itself — it resolves the
 * chosen option's code, or null when the shopper dismisses it.
 */

type Bag = Record<string, unknown>;

const WIDTH: Record<string, number> = { sm: 320, md: 380, lg: 460 };
const IMAGE: Record<string, number> = { sm: 96, md: 132, lg: 180 };
const SIDE_IMAGE: Record<string, number> = { sm: 64, md: 88, lg: 112 };
const OVERLAY: Record<string, string> = {
  none: 'transparent',
  light: 'rgba(0,0,0,.2)',
  medium: 'rgba(0,0,0,.45)',
  dark: 'rgba(0,0,0,.7)',
};
const RADIUS: Record<string, number> = { square: 0, rounded: 8, soft: 16 };
const CHIP_RADIUS: Record<string, number> = { square: 0, rounded: 4, pill: 999 };
const CHIP_SIZE: Record<string, { minWidth: number; paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { minWidth: 28, paddingVertical: 3, paddingHorizontal: 6, fontSize: 11 },
  md: { minWidth: 34, paddingVertical: 5, paddingHorizontal: 8, fontSize: 12 },
  lg: { minWidth: 42, paddingVertical: 8, paddingHorizontal: 12, fontSize: 13 },
};
const CHIP_WEIGHT: Record<string, string> = { normal: '400', medium: '500', bold: '700' };
const CHIP_BORDER: Record<string, number> = { none: 0, thin: 1, thick: 2 };
const CHIP_GAP: Record<string, number> = { tight: 4, normal: 6, loose: 10 };

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);

function token(ctx: AppStyleContext, name: string, literal: string): string {
  const raw = ctx.tokens?.[name] ?? ctx.tokens?.[name.replace(/^--/, '')];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : literal;
}

function colorOf(value: unknown, ctx: AppStyleContext): string | undefined {
  return parseColor(value, ctx) ?? undefined;
}

export interface SheetModel {
  /** `sheet` rises from the bottom edge, `center` floats in the middle. */
  placement: 'sheet' | 'center';
  overlay: string;
  box: NativeStyle;
  /** The picture's edge, or null for none. */
  imageSize: number | null;
  imageFit: 'contain' | 'cover';
  side: boolean;
  align: 'center' | 'start';
  showTitle: boolean;
  showPrice: boolean;
  showPrompt: boolean;
  addOnSelect: boolean;
  prompt: string;
  confirm: string;
  textColor: string;
  chip: NativeStyle & { fontSize: number };
  chipSelected: { backgroundColor: string; borderColor: string; color: string };
  chipText: { color: string; fontWeight: string };
  row: { flexDirection: 'row'; flexWrap: 'wrap' | 'nowrap'; justifyContent: string; gap: number };
  layout: 'wrap' | 'fill' | 'scroll';
  soldOut: 'strike' | 'fade' | 'hide';
  button: NativeStyle;
  buttonText: { color: string };
  fullWidthButton: boolean;
}

/**
 * The sheet's look: the card's window and chooser settings over the brand's
 * defaults (the storefront's own base rules: the brand's corner, surface, text,
 * brand and brand-text tokens). Pure, so it is tested without a renderer.
 */
export function sheetModel(
  window: Bag | null,
  chooser: Bag | null,
  ctx: AppStyleContext,
  texts: { prompt: string; confirm: string }
): SheetModel {
  const w = window ?? {};
  const c = chooser ?? {};
  const brand = token(ctx, '--selwise-brand', '#111111');
  const brandText = token(ctx, '--selwise-brand-text', '#ffffff');
  const surface = token(ctx, '--selwise-surface', '#ffffff');
  const text = token(ctx, '--selwise-text', '#111111');
  const border = token(ctx, '--selwise-border', '#d4d4d4');
  const brandRadius = Number.parseFloat(token(ctx, '--selwise-radius', '0')) || 0;

  const shape = str(w['shape']);
  const radius = shape ? (RADIUS[shape] ?? brandRadius) : brandRadius;
  const textColor = colorOf(w['textColor'], ctx) ?? text;
  const imageKey = str(w['image']) && w['image'] !== 'none' ? (w['image'] as string) : null;
  const side = w['layout'] === 'side';
  const placement = w['placement'] === 'center' ? 'center' : 'sheet';
  const chipSize = CHIP_SIZE[str(c['size']) ?? 'md'] ?? CHIP_SIZE['md']!;
  const layout = c['layout'] === 'fill' || c['layout'] === 'scroll' ? c['layout'] : 'wrap';
  const selectedBackground = colorOf(c['selectedBackground'], ctx) ?? brand;

  return {
    placement,
    overlay: OVERLAY[str(w['overlay']) ?? 'medium'] ?? OVERLAY['medium']!,
    box: {
      width: '100%',
      maxWidth: WIDTH[str(w['width']) ?? 'md'] ?? WIDTH['md'],
      backgroundColor: colorOf(w['background'], ctx) ?? surface,
      borderRadius: radius,
      ...(placement === 'sheet' ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxWidth: '100%' } : {}),
      paddingTop: 28,
      paddingHorizontal: 24,
      paddingBottom: 24,
    },
    imageSize: w['image'] === 'none' ? null : imageKey ? (side ? (SIDE_IMAGE[imageKey] ?? 88) : (IMAGE[imageKey] ?? 132)) : side ? 88 : 132,
    imageFit: w['imageFit'] === 'cover' ? 'cover' : 'contain',
    side,
    align: w['align'] === 'start' ? 'start' : 'center',
    showTitle: w['hideTitle'] !== true,
    showPrice: w['showPrice'] === true,
    showPrompt: w['hidePrompt'] !== true,
    addOnSelect: w['addOnSelect'] === true,
    prompt: str(w['prompt']) ?? texts.prompt,
    confirm: str(w['confirmLabel']) ?? texts.confirm,
    textColor,
    chip: {
      ...chipSize,
      borderRadius: CHIP_RADIUS[str(c['shape']) ?? 'rounded'] ?? 4,
      borderWidth: CHIP_BORDER[str(c['border']) ?? 'thin'] ?? 1,
      borderColor: colorOf(c['borderColor'], ctx) ?? border,
      backgroundColor: colorOf(c['background'], ctx) ?? 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipSelected: {
      backgroundColor: selectedBackground,
      borderColor: selectedBackground,
      color: colorOf(c['selectedTextColor'], ctx) ?? brandText,
    },
    chipText: { color: colorOf(c['textColor'], ctx) ?? textColor, fontWeight: CHIP_WEIGHT[str(c['weight']) ?? 'medium'] ?? '500' },
    row: {
      flexDirection: 'row',
      flexWrap: layout === 'scroll' ? 'nowrap' : 'wrap',
      justifyContent:
        c['align'] === 'start' || (c['align'] === undefined && w['align'] === 'start')
          ? 'flex-start'
          : c['align'] === 'end'
            ? 'flex-end'
            : 'center',
      gap: CHIP_GAP[str(c['gap']) ?? 'normal'] ?? 6,
    },
    layout,
    soldOut: c['soldOut'] === 'fade' || c['soldOut'] === 'hide' ? c['soldOut'] : 'strike',
    button: {
      backgroundColor: colorOf(w['buttonBackground'], ctx) ?? brand,
      borderRadius: radius,
      paddingVertical: 12,
      paddingHorizontal: 20,
      minWidth: 160,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: { color: colorOf(w['buttonTextColor'], ctx) ?? brandText },
    fullWidthButton: w['fullWidthButton'] === true,
  };
}

export interface SheetRequest {
  product: SelwiseProduct;
  variants: CardVariant[];
  confirmLabel: string;
  /** Resolves the chosen option's code, or null when the shopper closed the sheet. */
  resolve(code: string | null): void;
}

export interface VariantSheetProps {
  request: SheetRequest | null;
  window: Bag | null;
  chooser: Bag | null;
  ctx: AppStyleContext;
  currency: string | null | undefined;
  locale: string | undefined;
  language: string;
}

export function VariantSheet(props: VariantSheetProps): ReactElement | null {
  const { request, ctx, language } = props;
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(request ? (resolveInitialVariant(request.variants)?.variantCode ?? null) : null);
  }, [request]);

  if (!request) return null;
  const { product, variants } = request;
  const model = sheetModel(props.window, props.chooser, ctx, {
    prompt: shopperString('cart.chooseOption', language),
    confirm: request.confirmLabel,
  });
  const chosen = variants.find((variant) => variant.variantCode === selected) ?? null;
  const price = variantModalPriceFor({ price: product.price, originalPrice: product.originalPrice, currency: props.currency || product.currency }, chosen);
  const close = () => request.resolve(null);
  const visible = variants.filter((variant) => !(model.soldOut === 'hide' && variant.inStock === false));
  const start = model.align === 'start';

  const chip = (variant: CardVariant) => {
    const soldOut = variant.inStock === false;
    const on = selected === variant.variantCode;
    const label = variantLabel(variant);
    return h(
      Pressable,
      {
        key: variant.variantCode,
        accessibilityRole: 'radio',
        accessibilityLabel: soldOut ? `${label} (${shopperString('cart.soldOut', language)})` : label,
        accessibilityState: { selected: on, disabled: soldOut },
        disabled: soldOut,
        onPress: () => {
          setSelected(variant.variantCode);
          // "Add as soon as an option is chosen": the sheet draws no button.
          if (model.addOnSelect) request.resolve(variant.variantCode);
        },
        style: {
          ...model.chip,
          ...(on ? { backgroundColor: model.chipSelected.backgroundColor, borderColor: model.chipSelected.borderColor } : {}),
          ...(model.layout === 'fill' ? { flex: 1 } : {}),
          ...(soldOut ? { opacity: 0.4 } : {}),
        },
      },
      h(
        Text,
        {
          style: asText({
            fontSize: model.chip.fontSize,
            fontWeight: model.chipText.fontWeight,
            color: on ? model.chipSelected.color : model.chipText.color,
            textDecorationLine: soldOut && model.soldOut === 'strike' ? 'line-through' : 'none',
          }),
        },
        label
      )
    );
  };

  const money = (amount: unknown) => formatMoney(amount, props.currency || product.currency, props.locale);
  const priceLine =
    model.showPrice && typeof price.price === 'number'
      ? h(
          Text,
          { style: { fontSize: 14, fontWeight: '600', color: model.textColor, marginBottom: 14, textAlign: start ? 'left' : 'center' } },
          money(price.price),
          typeof price.originalPrice === 'number' && price.originalPrice > price.price
            ? h(Text, { style: { fontWeight: '400', opacity: 0.55, textDecorationLine: 'line-through' } }, `  ${money(price.originalPrice)}`)
            : null
        )
      : null;
  const titleView = model.showTitle && product.title
    ? h(Text, { style: { fontSize: 14, fontWeight: '600', color: model.textColor, marginBottom: 14, textAlign: start ? 'left' : 'center' } }, product.title)
    : null;
  const picture = product.imageUrl && model.imageSize !== null
    ? h(SelwiseImage, {
        uri: product.imageUrl,
        style: { width: model.imageSize, height: model.imageSize, marginBottom: model.side ? 0 : 14 },
        resizeMode: model.imageFit,
        accessibilityLabel: product.title,
      })
    : null;

  const head =
    picture || titleView || priceLine
      ? h(
          View,
          { style: model.side ? { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, marginRight: 32 } : { alignItems: start ? 'flex-start' : 'center', marginTop: 8 } },
          picture,
          h(View, { style: { flexShrink: 1 } }, titleView, priceLine)
        )
      : null;

  const options = h(
    View,
    { style: asView({ ...model.row, marginBottom: model.addOnSelect ? 0 : 20 }), accessibilityRole: 'radiogroup' },
    ...visible.map(chip)
  );

  const sheet = h(
    View,
    { style: model.box, testID: 'selwise-variant-sheet' },
    h(
      Pressable,
      { accessibilityRole: 'button', accessibilityLabel: shopperString('cart.close', language), onPress: close, hitSlop: 8, style: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' } },
      h(Text, { style: { fontSize: 20, color: model.textColor } }, '×')
    ),
    head,
    model.showPrompt && model.prompt
      ? h(Text, { style: { fontSize: 13, color: model.textColor, marginBottom: 12, textAlign: start ? 'left' : 'center' } }, model.prompt)
      : null,
    model.layout === 'scroll' ? h(ScrollView, { horizontal: true, showsHorizontalScrollIndicator: false }, options) : options,
    model.addOnSelect
      ? null
      : h(
          Pressable,
          {
            accessibilityRole: 'button',
            disabled: !selected,
            onPress: () => selected && request.resolve(selected),
            style: { ...model.button, ...(model.fullWidthButton ? { alignSelf: 'stretch' } : { alignSelf: start ? 'flex-start' : 'center' }), ...(selected ? {} : { opacity: 0.45 }) },
          },
          h(Text, { style: { fontSize: 13, fontWeight: '600', color: model.buttonText.color } }, model.confirm)
        )
  );

  return h(
    Modal,
    { visible: true, transparent: true, animationType: model.placement === 'sheet' ? 'slide' : 'fade', onRequestClose: close },
    h(
      View,
      { style: { flex: 1, justifyContent: model.placement === 'sheet' ? 'flex-end' : 'center', alignItems: 'center', padding: model.placement === 'sheet' ? 0 : 16 } },
      // A press on the dimmed page closes; one inside the box does not.
      h(Pressable, { accessibilityLabel: shopperString('cart.close', language), onPress: close, style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: model.overlay } }),
      sheet
    )
  );
}
