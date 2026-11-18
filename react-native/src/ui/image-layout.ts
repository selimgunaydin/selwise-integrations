import { toNativeStyle } from '../vendor/app-style.js';
import { styleContext } from './styles.js';

/**
 * How a campaign's picture is laid out, from the dashboard's image keys.
 *
 * Plain TypeScript (the translation is the contract's table, role `image`), so
 * it is tested in Node. The decisions are the web's (`image-renderer.ts`, the
 * popup, the slide-in and the bar): what the keys mean, what each type does when
 * a key was never touched, and when an edge-to-edge image is allowed.
 *
 * ## The defaults are per type
 *
 * The web seeds each type's own defaults (`TYPE_STYLE_CONFIGS`), and an app
 * reads a record that may predate a key, so each type states them once:
 *
 *  - the bar: a 24px thumbnail beside the text;
 *  - the popup, the newsletter and any other modal: a picture ABOVE the words,
 *    16:9, 12px radius;
 *  - the slide-in: a picture above the words, at its own ratio, 8px radius.
 */

export type ImageMode = 'thumbnail' | 'cover' | 'fullWidth';
export type ImagePosition = 'top' | 'bottom' | 'left' | 'right';

export interface ImageLayout {
  mode: ImageMode;
  position: ImagePosition;
  /** Beside the words (`left` / `right`) rather than above or below them. */
  horizontal: boolean;
  /** Edge to edge: outside the card's padding. Only for a full picture above or below the words. */
  bleed: boolean;
  /** The gap between the picture and the words. */
  spacing: number;
  /** A width/height ratio, or `'auto'`: the picture's own (known once it has loaded). */
  aspectRatio: number | 'auto';
  resizeMode: 'cover' | 'contain' | 'stretch';
  /** The picture's own style: its size and its corners. */
  style: { width?: number | string; height?: number; aspectRatio?: number; borderRadius: number; alignSelf?: 'stretch' };
}

interface TypeDefaults {
  mode: ImageMode;
  size: number;
  position: ImagePosition;
  aspect: string;
  radius: number;
  width: number;
  spacing: number;
}

const BAR: TypeDefaults = { mode: 'thumbnail', size: 24, position: 'left', aspect: 'auto', radius: 4, width: 0, spacing: 8 };
const MODAL: TypeDefaults = { mode: 'cover', size: 80, position: 'top', aspect: '16/9', radius: 12, width: 220, spacing: 16 };
const SLIDE_IN: TypeDefaults = { mode: 'cover', size: 60, position: 'top', aspect: 'auto', radius: 8, width: 220, spacing: 16 };

function defaultsOf(type: string): TypeDefaults {
  if (type === 'announcement_bar') return BAR;
  if (type === 'slide_in') return SLIDE_IN;
  return MODAL;
}

function aspectOf(value: unknown): number | 'auto' {
  if (typeof value === 'number') return value > 0 ? value : 'auto';
  if (typeof value !== 'string') return 'auto';
  const match = /^\s*(\d*\.?\d+)\s*(?:\/\s*(\d*\.?\d+))?\s*$/.exec(value);
  if (!match) return 'auto';
  const a = Number.parseFloat(match[1] ?? '');
  const b = match[2] === undefined ? 1 : Number.parseFloat(match[2]);
  return a > 0 && b > 0 ? a / b : 'auto';
}

const textOr = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

/** The layout of the picture of a `type` surface, from its `stylesJson`. */
export function imageLayout(type: string, styles: unknown): ImageLayout {
  const d = defaultsOf(type);
  const native = toNativeStyle('image', styles, styleContext());
  const num = (key: string, fallback: number): number => (typeof native[key] === 'number' ? (native[key] as number) : fallback);

  // The bar's picture is always a thumbnail beside the words (`announcement-bar.ts`).
  const requested = textOr(native['imageMode'], d.mode);
  const mode: ImageMode =
    type === 'announcement_bar' ? 'thumbnail' : requested === 'thumbnail' || requested === 'fullWidth' ? requested : 'cover';
  const requestedPosition = textOr(native['imagePosition'], d.position);
  // Only a modal lays a picture beside its words; the slide-in and the bar stack it.
  const positionable = type !== 'slide_in' && type !== 'announcement_bar';
  const position: ImagePosition =
    positionable && (['top', 'bottom', 'left', 'right'] as const).includes(requestedPosition as ImagePosition)
      ? (requestedPosition as ImagePosition)
      : d.position;
  const horizontal = position === 'left' || position === 'right';
  const bleed = native['bleed'] === true && mode !== 'thumbnail' && (position === 'top' || position === 'bottom');

  const bag = styles && typeof styles === 'object' ? (styles as Record<string, unknown>) : {};
  const rawAspect = bag['imageAspectRatio'];
  const effectiveAspect: number | 'auto' =
    rawAspect === undefined || rawAspect === null || rawAspect === '' ? aspectOf(d.aspect) : aspectOf(rawAspect);

  const fit = native['resizeMode'];
  const resizeMode: ImageLayout['resizeMode'] = fit === 'contain' || fit === 'stretch' ? fit : 'cover';

  // A full-width picture and an edge-to-edge one have square corners (the card's own radius clips them).
  const radius = bleed || mode === 'fullWidth' ? 0 : num('borderRadius', d.radius);
  const size = num('size', d.size);

  let style: ImageLayout['style'];
  if (mode === 'thumbnail') {
    style = { width: size, height: size, borderRadius: radius };
  } else if (horizontal) {
    style = {
      width: num('width', d.width),
      borderRadius: radius,
      ...(effectiveAspect === 'auto' ? { alignSelf: 'stretch' as const } : { aspectRatio: effectiveAspect }),
    };
  } else {
    style = {
      width: '100%',
      borderRadius: radius,
      ...(effectiveAspect === 'auto' ? {} : { aspectRatio: effectiveAspect }),
    };
  }

  return {
    mode,
    position,
    horizontal,
    bleed,
    spacing: num('spacing', d.spacing),
    aspectRatio: effectiveAspect,
    resizeMode,
    style,
  };
}

/** The ratio a picture with no declared one is drawn at until its own is known (an RN image has no height before it loads). */
export const FALLBACK_ASPECT_RATIO = 16 / 9;

/** Whether the address is an SVG (RN's `Image` cannot draw one without a host component). */
export function isSvgAddress(uri: string): boolean {
  return /\.svg(?:[?#]|$)/i.test(uri) || /^data:image\/svg\+xml/i.test(uri);
}

/**
 * The address a picture is fetched from, or null when it is not one an app may
 * draw: `https`, `http` and an inline `data:image/` are; a relative `/media/…`
 * path resolves against the merchant's storefront when the host named it, and is
 * skipped without one (there is no page to be relative to). The web accepts the
 * same shapes (`isSafeImageUrl`), plus `blob:`, which has no meaning here.
 */
export function imageAddress(value: unknown, storefrontUrl?: string): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/^(https?:|data:image\/)/i.test(text)) return text;
  if (text.startsWith('/') && !text.startsWith('//') && storefrontUrl) {
    return storefrontUrl.replace(/\/+$/, '') + text;
  }
  return null;
}
