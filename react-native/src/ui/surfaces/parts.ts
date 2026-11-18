import { createElement as h, useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, Dimensions, Easing, Image, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSelwiseHost } from '../../react/context.js';
import { SelwiseImage, SelwiseText as Text, sayOnce } from '../host-hooks.js';
import { countAt } from '../counter.js';
import { FALLBACK_ASPECT_RATIO, imageAddress, isSvgAddress, type ImageLayout } from '../image-layout.js';
import { ENTRANCE_MS, slideDistance, type Entrance } from '../motion.js';
import { buttonStyle, closeGlyphColor, nativeValues } from '../styles.js';
import { pickId } from '../pick-ids.js';

/**
 * The pieces every surface renderer is built from: the merchant's button, the
 * close affordance, a picture, and the three motions (the entrance, the pulse,
 * the count-up).
 */

type Content = Record<string, unknown>;

/** The smallest touch target the platforms' guidelines allow, which the web's own close button reaches on a phone (`min-width: 44px`). */
export const CLOSE_TARGET = 44;
const GLYPH_WIDTH = 28;
const GLYPH_HEIGHT = 22;

/** The merchant's button, or nothing when they wrote no label. */
export function SurfaceButton(props: {
  styles: unknown;
  label: unknown;
  onPress: () => void;
  /** What the type does when the merchant never touched "full width": a modal's button fills its card, a bar's does not. */
  fullWidthDefault?: boolean;
  disabled?: boolean;
}): ReactElement | null {
  const { styles, label, onPress, fullWidthDefault, disabled } = props;
  if (!label) return null;

  const button = buttonStyle(styles, fullWidthDefault === undefined ? undefined : { fullWidthDefault });
  return h(
    Pressable,
    {
      onPress: onPress,
      disabled: disabled === true,
      accessibilityRole: 'button',
      testID: pickId('button', 'buttonText'),
      style: [base.button, button.container, disabled === true ? base.disabled : null],
    },
    h(Text, { style: button.label, numberOfLines: 1 }, String(label))
  );
}

/**
 * The close affordance. Only drawn when the merchant enabled it.
 *
 * `onSurface` is not cosmetic. A bar or a footer paints its own brand-coloured
 * ground, so white is the readable default there; a modal card is white, and
 * the same default made the × invisible — a popup the visitor could not
 * dismiss at all. The per-type style allow-list does not offer
 * `closeButtonColor` on every type, so the DEFAULT has to be right rather than
 * something a merchant can correct.
 *
 * The target is `CLOSE_TARGET` points square whatever the glyph's size: a 20pt ×
 * is below every touch-target guideline, and the web's close button grows to 44
 * on a phone for the same reason.
 */
export function CloseButton(props: { styles: Content; onPress: () => void; onSurface?: boolean }): ReactElement | null {
  const { styles, onPress, onSurface } = props;
  if (nativeValues('close', styles)['visible'] === false) return null;

  return h(
    Pressable,
    {
      onPress: onPress,
      accessibilityRole: 'button',
      accessibilityLabel: 'Kapat',
      testID: pickId('close'),
      hitSlop: {
        top: (CLOSE_TARGET - GLYPH_HEIGHT) / 2,
        bottom: (CLOSE_TARGET - GLYPH_HEIGHT) / 2,
        left: (CLOSE_TARGET - GLYPH_WIDTH) / 2,
        right: (CLOSE_TARGET - GLYPH_WIDTH) / 2,
      },
      style: onSurface ? base.closeCorner : base.close,
    },
    h(Text, { style: [base.closeGlyph, { color: closeGlyphColor(styles, { onSurface: onSurface }) }] }, '×')
  );
}

/**
 * A picture's own ratio, once the platform can say it (`Image.getSize`): a
 * `16/9` picture is drawn at 16/9 at once, an `auto` one is drawn at the
 * fallback until its size is known and then at its own. Nothing when the
 * platform cannot measure (a host's own image component, a test).
 */
function useNaturalAspectRatio(uri: string | null, wanted: boolean): number | null {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const getSize = (Image as unknown as { getSize?: (uri: string, ok: (w: number, h: number) => void, fail: () => void) => void }).getSize;
    if (!wanted || !uri || typeof getSize !== 'function') return undefined;
    let cancelled = false;
    getSize(
      uri,
      (width, height) => {
        if (!cancelled && width > 0 && height > 0) setRatio(width / height);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [uri, wanted]);
  return ratio;
}

/**
 * A campaign's picture, drawn as `layout` says (`image-layout.ts`).
 *
 * An SVG is drawn only through the host's own image component
 * (`host.renderImage`): React Native's `Image` cannot draw one, and saying so
 * once in the log beats an empty space nobody can explain. An address an app may
 * not draw (a relative path with no storefront to resolve it against) draws
 * nothing, as the web's safe-address check does.
 */
export function SurfaceImage(props: { uri: unknown; layout: ImageLayout; accessibilityLabel?: string }): ReactElement | null {
  const { uri, layout, accessibilityLabel } = props;
  const host = useSelwiseHost();
  const address = imageAddress(uri, host.storefrontUrl);
  const needsNatural = layout.mode !== 'thumbnail' && layout.aspectRatio === 'auto' && !layout.horizontal;
  const natural = useNaturalAspectRatio(address, needsNatural);
  if (!address) return null;
  if (isSvgAddress(address) && !host.renderImage) {
    sayOnce('svg:' + address, 'a campaign picture is an SVG, which React Native cannot draw: pass `host.renderImage` to draw it. Skipped.');
    return null;
  }
  const style = needsNatural ? { ...layout.style, aspectRatio: natural ?? FALLBACK_ASPECT_RATIO } : layout.style;
  return h(SelwiseImage, {
    uri: address,
    style,
    resizeMode: layout.resizeMode,
    testID: pickId('image', 'imageUrl'),
    ...(accessibilityLabel ? { accessibilityLabel } : {}),
  });
}

/**
 * How a modal-mode surface arrives (`entranceOf`): the style to put on the
 * `Animated.View` that holds it. The value runs once, on mount, in 300ms.
 */
export function useEntrance(entrance: Entrance): StyleProp<ViewStyle> {
  const progress = useRef(new Animated.Value(entrance.kind === 'none' ? 1 : 0)).current;
  useEffect(() => {
    if (entrance.kind === 'none') return;
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTRANCE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // The entrance plays once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entrance.kind === 'none') return undefined;
  if (entrance.kind === 'fade') return { opacity: progress } as unknown as ViewStyle;
  if (entrance.kind === 'scale') {
    return {
      opacity: progress,
      transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
    } as unknown as ViewStyle;
  }
  const distance = slideDistance(entrance.from, Dimensions.get('window'));
  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  return {
    transform: [entrance.from === 'bottom' ? { translateY: offset } : { translateX: offset }],
  } as unknown as ViewStyle;
}

/** The floating button's pulse: a slow swell, forever, while `enabled`. */
export function usePulse(enabled: boolean): StyleProp<ViewStyle> {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!enabled) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, scale]);
  return enabled ? ({ transform: [{ scale }] } as unknown as ViewStyle) : undefined;
}

/**
 * The number a counter shows: from 0 up to `target` over `durationMs` the first
 * time (the web's count-up), straight to a later value. Without animation, the
 * target at once.
 */
export function useCountUp(target: number, animate: boolean, durationMs: number): number {
  const [shown, setShown] = useState(animate ? 0 : target);
  const played = useRef(false);

  useEffect(() => {
    if (!animate || played.current) {
      setShown(target);
      return undefined;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      setShown(countAt(target, elapsed, durationMs));
      if (elapsed >= durationMs) {
        played.current = true;
        clearInterval(timer);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, animate, durationMs]);

  return shown;
}

export const base = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  barText: { flex: 1 },
  barImage: { flexShrink: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' },
  footerText: { flex: 1, gap: 2 },
  button: { paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.6 },
  close: { paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  closeCorner: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  closeGlyph: { fontSize: 20, lineHeight: GLYPH_HEIGHT },
  floating: { position: 'absolute', zIndex: 9999 },
  floatingCircle: { alignItems: 'center', justifyContent: 'center' },
  floatingLabel: { textAlign: 'center' },
  tooltip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, maxWidth: 220 },
  tooltipText: { fontSize: 11 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', position: 'relative' },
  badgePill: { position: 'absolute', top: -6, right: -6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  timer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' },
  timerBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  timerUnit: { alignItems: 'center', minWidth: 28 },
  timerLabel: { fontSize: 9, opacity: 0.7 },
  timerSeparator: { fontWeight: '700' },
  goalBar: { width: '100%', gap: 8 },
  goalTrack: { width: '100%', overflow: 'hidden', position: 'relative' },
  goalFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  // The browser's tick: the text colour at a quarter strength.
  goalMarker: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, opacity: 0.25 },
});
