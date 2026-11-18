import { useEffect } from 'react';
import type { Selwise } from '../client.js';
import type { Strip } from '../core/strips.js';

/**
 * What the screen drew, kept for the on-device diagnostics panel
 * (`SelwiseDebugOverlay`).
 *
 * `Selwise.explain()` says why a surface is NOT on the screen; the panel also
 * needs what IS, and the client does not know that: drawing is the overlay's and
 * the points' business. They tell this board, and only when the host started the
 * client with `debug: true` (`client.debugOverlayEnabled`). With debug off no
 * report is ever written and nothing listens, so a release build pays for a
 * boolean read per render and nothing else.
 *
 * Plain TypeScript except for the one hook at the end. It records; it decides
 * nothing.
 */

export interface DrawnSurface {
  id: string;
  type: string;
  /** Where it went: `dock top`, `dock bottom`, `floating`, `window`, or `slot <name>`. */
  where: string;
}

export interface DrawnStrip {
  id: string;
  name?: string;
}

/** The key strips are filed under when no named point drew them (`<RecommendationStrips>`). */
export const SCREEN_STRIPS = '(screen)';

export class DebugBoard {
  private surfacesScreen: string | null = null;
  private surfaces: readonly DrawnSurface[] = [];
  private readonly strips = new Map<symbol, { screen: string; point: string; strips: readonly DrawnStrip[] }>();
  private readonly listeners = new Set<() => void>();
  /** The overlays mounted for this client, oldest first: only the first draws. */
  private readonly overlays: symbol[] = [];

  /** The campaigns and widgets the overlay drew on `screen`, replacing the last answer. */
  setSurfaces(screen: string | null, surfaces: readonly DrawnSurface[]): void {
    const same =
      screen === this.surfacesScreen &&
      surfaces.length === this.surfaces.length &&
      surfaces.every((entry, index) => {
        const before = this.surfaces[index];
        return before !== undefined && before.id === entry.id && before.type === entry.type && before.where === entry.where;
      });
    if (same) return;
    this.surfacesScreen = screen;
    this.surfaces = surfaces;
    this.emit();
  }

  /** The strips one owner (a point, or the screen's strip list) draws; `clearStrips` withdraws them. */
  setStrips(owner: symbol, screen: string, point: string, strips: readonly DrawnStrip[]): void {
    this.strips.set(owner, { screen, point, strips });
    this.emit();
  }

  clearStrips(owner: symbol): void {
    if (this.strips.delete(owner)) this.emit();
  }

  /** What is drawn on `screen` right now. */
  snapshot(screen: string | null): { surfaces: DrawnSurface[]; strips: Array<{ point: string; strips: DrawnStrip[] }> } {
    const byPoint = new Map<string, DrawnStrip[]>();
    for (const entry of this.strips.values()) {
      if (screen !== null && entry.screen !== screen) continue;
      byPoint.set(entry.point, [...(byPoint.get(entry.point) ?? []), ...entry.strips]);
    }
    return {
      surfaces: screen !== null && screen === this.surfacesScreen ? [...this.surfaces] : [],
      strips: [...byPoint.entries()].map(([point, strips]) => ({ point, strips })),
    };
  }

  /**
   * One overlay per client: every mounted `SelwiseDebugOverlay` claims the board
   * and only the oldest claim draws, so `<SelwiseSurfaces />` plus a manual mount
   * is one button, not two on top of each other. Returns the release; when the
   * drawing one goes, the next claim takes over.
   */
  claimOverlay(token: symbol): () => void {
    this.overlays.push(token);
    this.emit();
    return () => {
      const at = this.overlays.indexOf(token);
      if (at === -1) return;
      this.overlays.splice(at, 1);
      this.emit();
    };
  }

  /** Whether `token`'s overlay is the one that draws. */
  drawsOverlay(token: symbol): boolean {
    return this.overlays[0] === token;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

const boards = new WeakMap<object, DebugBoard>();

/** The diagnostics board of a client (created on first use). */
export function debugBoardOf(client: object): DebugBoard {
  let board = boards.get(client);
  if (!board) {
    board = new DebugBoard();
    boards.set(client, board);
  }
  return board;
}

/**
 * Reports the strips a component drew to the panel — nothing when the client is
 * not in debug mode. `point` is the named point, or `SCREEN_STRIPS`. With debug
 * off the flag is read first and no list or signature is built per render; an
 * empty list reports nothing (the cleanup of the previous report withdrew it).
 */
export function useReportDrawnStrips(client: Selwise, screen: string, point: string, strips: readonly Strip[]): void {
  const on = client.debugOverlayEnabled;
  const signature = on ? strips.map((strip) => strip.widget.id).join(',') : '';
  useEffect(() => {
    if (!on || strips.length === 0) return undefined;
    const board = debugBoardOf(client);
    // One owner per component instance: the effect's own token, never shared.
    const owner = Symbol(point);
    board.setStrips(
      owner,
      screen,
      point,
      strips.map((strip) => ({ id: strip.widget.id, ...(strip.widget.name ? { name: strip.widget.name } : {}) }))
    );
    return () => board.clearStrips(owner);
    // `signature` is the strips; the effect is about the list changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, on, screen, point, signature]);
}
