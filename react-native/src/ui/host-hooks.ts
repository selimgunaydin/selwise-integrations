import {
  createElement as h,
  useCallback,
  type ReactElement,
} from 'react';
import {
  Image,
  Linking,
  Platform,
  StatusBar,
  Text,
  type ImageStyle,
  type StyleProp,
  type TextProps,
} from 'react-native';
import { useSelwise, useSelwiseHost } from '../react/context.js';
import { useThemeVersion } from '../react/use-selwise-state.js';
import type {
  SelwiseNavigationKind,
  SelwiseNavigationSource,
  SelwiseNavigationTarget,
  SelwiseSafeAreaInsets,
} from '../react/host.js';
import { mapHostFont } from './host-font.js';
import { getThemeTokens, setThemeTokens } from './styles.js';

/**
 * What the components read from `<SelwiseProvider>`'s `host` — each with the
 * plain fallback that applies when the app handed over nothing.
 */

/**
 * The brand theme, handed to the style translator before the first paint.
 *
 * Widget style defaults are literally `'var(--selwise-brand, #1a1a1a)'`, and
 * React Native has no `var()`: without the tokens every unmodified widget would
 * draw its fallback instead of the merchant's brand. Written during render, not
 * in an effect, so even the first frame resolves them; it is idempotent, and a
 * `theme` event (the tokens arrive with `/config`, after the first render) draws
 * the component again.
 */
export function useBrandTheme(): void {
  const client = useSelwise();
  useThemeVersion();
  setThemeTokens(client.getTheme());
}

/** Whichever the iOS/Android platform guesses at when the app passed no insets. */
function platformInsets(): SelwiseSafeAreaInsets {
  return {
    // A notched iPhone's status bar is 44-59pt; Android reports its own height.
    top: Platform.OS === 'ios' ? 47 : StatusBar.currentHeight || 24,
    bottom: Platform.OS === 'ios' ? 34 : 0,
    left: 0,
    right: 0,
  };
}

/**
 * Safe-area insets: the app's (`host.safeAreaInsets`, an object or a hook), else
 * a platform-shaped guess rather than zero. Docking a surface at `top: 0`
 * without the inset puts the merchant's copy under the status bar, which is a
 * visible defect rather than a graceful degradation.
 */
export function useSafeAreaInsets(): SelwiseSafeAreaInsets {
  const source = useSelwiseHost().safeAreaInsets;
  // A function is a hook the app passed (`useSafeAreaInsets`); the host is stable
  // for the life of the provider, so it is called on every render or on none.
  const insets = typeof source === 'function' ? tryHook(source) : source;
  return insets ?? platformInsets();
}

function tryHook<T>(hook: () => T): T | undefined {
  try {
    return hook();
  } catch {
    // Thrown when there is no provider above this component.
    return undefined;
  }
}

/** The kind of a link, by its shape (`SelwiseNavigationKind`). */
export function classifyLink(url: string): SelwiseNavigationKind {
  const text = String(url || '').trim();
  if (/^app:\/\//i.test(text)) return 'screen';
  if (/^https?:\/\//i.test(text)) return 'https';
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return 'deeplink';
  return 'path';
}

export interface NavigationRequest {
  url: string;
  source: SelwiseNavigationSource;
  entityId?: string;
}

/**
 * Opens a link through the app's `host.navigate`; when the app has none, or it
 * answers `false`, an `https` or custom-scheme link goes to the OS and anything
 * else — a storefront path, a screen address — is left alone rather than sent to
 * the OS, which would fail silently. Resolves whether something opened.
 */
export function useNavigate(): (request: NavigationRequest) => Promise<boolean> {
  const host = useSelwiseHost();
  return useCallback(
    async (request) => {
      const url = String(request.url || '').trim();
      if (!url) return false;
      const target: SelwiseNavigationTarget = { ...request, url, kind: classifyLink(url) };

      if (host.navigate) {
        try {
          if ((await host.navigate(target)) !== false) return true;
        } catch {
          // The app's router refused: the fallback below is better than nothing.
        }
      }
      if (target.kind === 'https' || target.kind === 'deeplink') {
        try {
          await Linking.openURL(url);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    [host]
  );
}

/**
 * Whether the screen this component sits on is in front of the shopper:
 * `host.useIsFocused` (a hook, for React Navigation), else `host.isFocused`,
 * else always.
 */
export function useIsFocusedFn(): () => boolean {
  const host = useSelwiseHost();
  const fromHook = host.useIsFocused ? tryHook(host.useIsFocused) : undefined;
  const plain = host.isFocused;
  return useCallback(() => (fromHook ? fromHook() : plain ? plain() : true), [fromHook, plain]);
}

/** The first family of a CSS font stack, unquoted: `"Inter", sans-serif` -> `Inter`. */
export function firstFontFamily(stack: string | null | undefined): string | undefined {
  const first = String(stack ?? '').split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').trim();
  return first || undefined;
}

/**
 * The app's font for a font stack (`host.fontFamily`), or undefined — the app's
 * own default. `stack` is a surface's own font (`"Inter", sans-serif`); without
 * one it is the brand's.
 *
 * It follows the brand theme, so it re-renders its component when the theme
 * moves: call it only where the host has a mapping (see `SelwiseText`).
 */
function useFontFamily(stack?: string): string | undefined {
  const host = useSelwiseHost();
  useThemeVersion();
  const mapping = host.fontFamily;
  if (!mapping) return undefined;
  const named = firstFontFamily(stack) ?? firstFontFamily(getThemeTokens()['--selwise-font']);
  if (!named) return undefined;
  return mapHostFont(mapping, named);
}

/** `Text` in the app's font for the brand's font: the part of `SelwiseText` that exists only when the host mapped one. */
function MappedText(props: TextProps & { fontStack?: string }): ReactElement {
  const { fontStack, ...textProps } = props;
  const family = useFontFamily(fontStack);
  return h(Text, family ? { ...textProps, style: [{ fontFamily: family }, textProps.style] } : textProps);
}

/**
 * `Text` in the app's font for the brand's font, when the host mapped one.
 * `fontStack` names another font than the brand's (a search's own).
 *
 * Only a host with a font mapping follows the brand theme: without one there is
 * nothing to resolve, so a screen of these does not each subscribe to the
 * `theme` event. The host is stable for the life of the provider, so one
 * instance keeps the same component (and the same hooks) for its life.
 */
export function SelwiseText(props: TextProps & { fontStack?: string }): ReactElement {
  const host = useSelwiseHost();
  if (host.fontFamily) return h(MappedText, props);
  const { fontStack: _fontStack, ...textProps } = props;
  return h(Text, textProps);
}

export interface SelwiseImageViewProps {
  uri: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  accessibilityLabel?: string;
  /** Names the picture for a UI test and the dashboard's preview (`pick-ids.ts`). The app's own image component is handed none. */
  testID?: string;
}

/** A product image: the app's (`host.renderImage`), else React Native's `Image`. */
export function SelwiseImage(props: SelwiseImageViewProps): ReactElement | null {
  const host = useSelwiseHost();
  const resizeMode = props.resizeMode ?? 'contain';
  if (host.renderImage) {
    return host.renderImage({
      uri: props.uri,
      style: props.style,
      resizeMode,
      ...(props.accessibilityLabel ? { accessibilityLabel: props.accessibilityLabel } : {}),
    });
  }
  return h(Image, {
    source: { uri: props.uri },
    style: props.style,
    resizeMode,
    ...(props.accessibilityLabel ? { accessibilityLabel: props.accessibilityLabel } : {}),
    ...(props.testID ? { testID: props.testID } : {}),
  });
}

const said = new Set<string>();

/**
 * Logs `message` once per `key`. A capability the app did not hand over — a
 * WebView for the merchant's own HTML — is a reason a surface is missing, and
 * saying it beats an unexplained empty space.
 */
export function sayOnce(key: string, message: string): void {
  if (said.has(key)) return;
  said.add(key);
  // eslint-disable-next-line no-console
  console.log(`[Selwise] ${message}`);
}

/** Test seam: forget what was said. */
export function resetSaid(): void {
  said.clear();
}
