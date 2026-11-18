import { useEffect, useState, type ReactElement } from 'react';

/**
 * What `<SelwiseSurfaces>` and the `<SelwiseSlot>`s of a screen say to each
 * other.
 *
 * ## Why a board
 *
 * A campaign the merchant sent to a point (an announcement bar inside the
 * product screen, a counter under the price, an inline newsletter) is drawn BY
 * the point the app mounted, but decided — targeting, caps, experiments, the
 * trigger, the impression — by the one overlay that decides every surface. The
 * overlay needs to know which points exist (a campaign for a point nobody
 * mounted is not drawn, not counted, and never falls back to a dock), and each
 * point needs the surfaces the overlay drew for it. The board is that and
 * nothing else: it decides nothing.
 *
 * One board per client (`boardOf`), so a point works under any provider without
 * the app threading anything through.
 *
 * Plain TypeScript except for the two hooks at the end.
 */

type Listener = () => void;

export class SurfaceBoard {
  /** point -> the mounts of it (one per `<SelwiseSlot>` instance). */
  private readonly mounted = new Map<string, Set<symbol>>();
  /** point -> the mounts of it that are on the shopper's screen right now. */
  private readonly visible = new Map<string, Set<symbol>>();
  private drawn = new Map<string, ReactElement[]>();
  private readonly stateListeners = new Set<Listener>();
  private readonly drawnListeners = new Set<Listener>();

  /** A point was mounted. Returns the unmount. */
  mount(slot: string): { token: symbol; unmount: () => void } {
    const token = Symbol(slot);
    const set = this.mounted.get(slot) ?? new Set<symbol>();
    set.add(token);
    this.mounted.set(slot, set);
    this.emitState();
    return {
      token,
      unmount: () => {
        const current = this.mounted.get(slot);
        current?.delete(token);
        if (current && current.size === 0) this.mounted.delete(slot);
        const open = this.visible.get(slot);
        open?.delete(token);
        if (open && open.size === 0) this.visible.delete(slot);
        this.emitState();
      },
    };
  }

  /** A mount of the point says whether it is on the shopper's screen (a point below the fold is not). */
  setOnScreen(slot: string, token: symbol, open: boolean): void {
    const set = this.visible.get(slot) ?? new Set<symbol>();
    if (open === set.has(token)) return;
    if (open) set.add(token);
    else set.delete(token);
    if (set.size === 0) this.visible.delete(slot);
    else this.visible.set(slot, set);
    this.emitState();
  }

  isMounted(slot: string): boolean {
    return (this.mounted.get(slot)?.size ?? 0) > 0;
  }

  isOnScreen(slot: string): boolean {
    return (this.visible.get(slot)?.size ?? 0) > 0;
  }

  /** What the overlay drew for each point, replacing the last answer. */
  publish(next: ReadonlyMap<string, ReactElement[]>): void {
    this.drawn = new Map(next);
    for (const listener of [...this.drawnListeners]) listener();
  }

  drawnAt(slot: string): readonly ReactElement[] {
    return this.drawn.get(slot) ?? [];
  }

  /** Mounted / on-screen changes — the overlay listens, to decide what to draw and count. */
  onState(listener: Listener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** The overlay's answer changed — the points listen, to draw it. */
  onDrawn(listener: Listener): () => void {
    this.drawnListeners.add(listener);
    return () => this.drawnListeners.delete(listener);
  }

  private emitState(): void {
    for (const listener of [...this.stateListeners]) listener();
  }
}

const boards = new WeakMap<object, SurfaceBoard>();

/** The board of a client (created on first use). */
export function boardOf(client: object): SurfaceBoard {
  let board = boards.get(client);
  if (!board) {
    board = new SurfaceBoard();
    boards.set(client, board);
  }
  return board;
}

/** Draws the component again whenever a point is mounted, unmounted or moves on or off the screen. */
export function useBoardState(board: SurfaceBoard): void {
  const [, setVersion] = useState(0);
  useEffect(() => board.onState(() => setVersion((value) => value + 1)), [board]);
}

/** Draws the component again whenever the overlay publishes a new answer. */
export function useBoardDrawn(board: SurfaceBoard): void {
  const [, setVersion] = useState(0);
  useEffect(() => board.onDrawn(() => setVersion((value) => value + 1)), [board]);
}
