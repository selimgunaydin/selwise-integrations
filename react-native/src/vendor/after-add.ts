// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/recommendation-contract/src/after-add.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/recommendation-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * What the shopper sees after an add (Recommendations → Cart → After adding),
 * and the Selwise message's own settings.
 *
 * `@selwise/recommendation-contract/after-add` — dependency-free, so the
 * storefront widget (which may not import the barrel: it sits in every strip
 * chunk) reads the SAME lists, bounds and message template the dashboard and
 * the API do. Each of these used to be written out in the widget as well, held
 * in step only by a spec.
 *
 * - `host`  (the default, and what every strip did before the setting existed)
 *           the storefront's own interface: its counter, its cart window or
 *           message, whatever its own add does. No Selwise toast.
 * - `toast` the storefront's counters are brought up to date, its cart window is
 *           NOT opened, and Selwise says what happened in a small toast — the
 *           sentence for a refusal included.
 * - `quiet` the counters are brought up to date and nothing else is shown or
 *           opened; the button's own text is the only feedback.
 *
 * An absent value is `host`: a strip saved before this existed keeps behaving
 * exactly as it did.
 */
export const AFTER_ADD_MODES = ['host', 'toast', 'quiet'] as const;
export type AfterAddMode = (typeof AFTER_ADD_MODES)[number];

export function isAfterAddMode(value: unknown): value is AfterAddMode {
  return typeof value === 'string' && (AFTER_ADD_MODES as readonly string[]).includes(value);
}

/**
 * The Selwise message (`afterAdd: 'toast'`). Colour and type are NOT settings
 * here: the message is painted from the brand (Design → Brand), so one change
 * there restyles it with every other surface, and a strip cannot drift from
 * the storefront's look.
 *
 * - `afterAddMessage`   the sentence for a successful add, per language; the
 *                       word `{product}` becomes the product's name. Absent:
 *                       the button's "added" text, then the widget's phrase.
 * - `afterAddPosition`  `bottom` (default) or `top`.
 * - `afterAddSeconds`   how long a success stays; a refusal stays two seconds
 *                       longer, because it is the one worth a second look.
 */
export const AFTER_ADD_POSITIONS = ['bottom', 'top'] as const;
export type AfterAddPosition = (typeof AFTER_ADD_POSITIONS)[number];
export const AFTER_ADD_DEFAULT_POSITION: AfterAddPosition = 'bottom';

export function isAfterAddPosition(value: unknown): value is AfterAddPosition {
  return typeof value === 'string' && (AFTER_ADD_POSITIONS as readonly string[]).includes(value);
}

export const AFTER_ADD_TOAST_LIMITS = {
  messageMax: 120,
  secondsMin: 2,
  secondsMax: 10,
  secondsDefault: 3.5,
} as const;

/**
 * What a duration box holds, as a number — a Turkish keyboard types "4,5" —
 * or `NaN` for text that is not one. `''` and `null` are "not set" (`undefined`).
 */
function secondsTyped(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    return value.trim() === '' ? undefined : Number(value.trim().replace(',', '.'));
  }
  return typeof value === 'number' ? value : Number.NaN;
}

/** Why a typed duration is refused, or `undefined` when it is empty (the default) or inside the bounds. */
export function afterAddSecondsProblem(value: unknown): 'number' | 'min' | 'max' | undefined {
  const seconds = secondsTyped(value);
  if (seconds === undefined) return undefined;
  if (!Number.isFinite(seconds)) return 'number';
  if (seconds < AFTER_ADD_TOAST_LIMITS.secondsMin) return 'min';
  if (seconds > AFTER_ADD_TOAST_LIMITS.secondsMax) return 'max';
  return undefined;
}

/** A duration inside the bounds, or `undefined` (not stored: the widget's own default applies). */
export function afterAddSecondsOf(value: unknown): number | undefined {
  const seconds = secondsTyped(value);
  return seconds !== undefined && afterAddSecondsProblem(value) === undefined ? seconds : undefined;
}

/**
 * The message a shopper reads: `template` with `{product}` replaced by the
 * product's name. The dashboard's preview and the widget both call it, so what
 * the merchant sees is what the storefront draws. A missing name leaves no
 * hole (`"Added: {product} !"` → `"Added: !"`).
 */
export function renderAfterAddMessage(template: string, productName: string | undefined): string {
  return template
    .replace(/\{product\}/g, (productName ?? '').trim())
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * The sentence a successful add says: the merchant's message (rendered), else
 * the first non-empty fallback in order — the card's "added" text, the strip's,
 * the widget's own phrase. The widget and the dashboard's preview both read it,
 * so the preview cannot say a sentence the storefront does not.
 */
export function afterAddToastText(
  template: string | undefined,
  productName: string | undefined,
  ...fallbacks: Array<string | undefined>
): string {
  const written = template ? renderAfterAddMessage(template, productName) : '';
  return written || fallbacks.find((text) => typeof text === 'string' && text.trim() !== '') || '';
}
