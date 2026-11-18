/** Stops a subscription. Safe to call twice. */
export type Unsubscribe = () => void;

/**
 * A minimal typed event emitter: what `Selwise.on()` is made of.
 *
 * A listener that throws never stops the ones after it and never reaches the
 * code that emitted — state changes are reported from inside a host's own
 * callbacks (a navigation event, a store subscription), and a broken
 * subscriber must not break them.
 */
export class Emitter<Events extends { [name: string]: unknown }> {
  // The listener's argument type depends on the event name, which a Map keyed by
  // string cannot say; the public methods are where it is checked.
  private readonly listeners = new Map<string, Set<(value: never) => void>>();

  constructor(private readonly onError: (event: string, error: unknown) => void = () => undefined) {}

  on<K extends keyof Events & string>(event: K, listener: (value: Events[K]) => void): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  emit<K extends keyof Events & string>(event: K, value: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const listener of [...set]) {
      try {
        (listener as (value: Events[K]) => void)(value);
      } catch (error) {
        this.onError(event, error);
      }
    }
  }
}
