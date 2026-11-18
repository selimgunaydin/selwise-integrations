import { useSyncExternalStore } from 'react';

/**
 * The app's favourites — a plain in-memory list. A real app keeps them on its
 * backend; what Selwise needs is only to ask this list ("is it a favourite?"),
 * to change it when a product card's heart is pressed, and to hear when it
 * changes (src/host.tsx hands those three to the SDK).
 */
const items = new Set<string>();
const listeners = new Set<() => void>();

export const favourites = {
  has: (code: string) => items.has(code),
  set(code: string, wished: boolean) {
    if (wished) items.add(code);
    else items.delete(code);
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Whether a product is a favourite, redrawing when that changes. */
export function useIsFavourite(code: string): boolean {
  return useSyncExternalStore(favourites.subscribe, () => favourites.has(code));
}
