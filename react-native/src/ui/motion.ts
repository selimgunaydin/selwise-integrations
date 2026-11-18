/**
 * How a surface arrives on the screen.
 *
 * Plain TypeScript, tested in Node; `surfaces/index.ts` turns the answer into an
 * `Animated` value. The web's timings are the model: 0.3s, ease out.
 */

export type Edge = 'bottom' | 'right' | 'left';

export type Entrance =
  | { kind: 'none' }
  | { kind: 'fade' }
  | { kind: 'scale' }
  | { kind: 'slide'; from: Edge };

export const ENTRANCE_MS = 300;

const EDGES: readonly string[] = ['bottom', 'right', 'left'];

/**
 * The entrance of a modal-mode surface.
 *
 * - The slide-in comes in from the edge its position names (`right`, `left`,
 *   `bottom`).
 * - The popup follows its `animation` style (`none`, `fade`, `scale`, `slide` —
 *   the last rises from the bottom, the web's `selwise-slide-up`); the web's
 *   default is `scale`.
 * - A newsletter, centred, fades in; one the merchant put at the bottom rises.
 */
export function entranceOf(type: string, position: string, styles: unknown): Entrance {
  if (type === 'slide_in') return { kind: 'slide', from: EDGES.includes(position) ? (position as Edge) : 'right' };
  if (type === 'exit_intent_popup') {
    const chosen = styles && typeof styles === 'object' ? (styles as Record<string, unknown>)['animation'] : undefined;
    if (chosen === 'none') return { kind: 'none' };
    if (chosen === 'fade') return { kind: 'fade' };
    if (chosen === 'slide') return { kind: 'slide', from: 'bottom' };
    return { kind: 'scale' };
  }
  return position === 'bottom' ? { kind: 'slide', from: 'bottom' } : { kind: 'fade' };
}

/** How far off its resting place a card starts, per edge: a screen's width or height, so it enters from outside. */
export function slideDistance(from: Edge, window: { width: number; height: number }): number {
  return from === 'bottom' ? window.height : from === 'right' ? window.width : -window.width;
}
