/**
 * One request per question at a time: callers that ask while the answer is on
 * its way wait for it instead of asking again. An entry is dropped when its
 * promise settles — a rejection included — and only if it is still THAT
 * promise, so a late settle never evicts a newer request for the same key.
 */
export class SingleFlight<K, V> {
  private readonly flights = new Map<K, Promise<V>>();

  /** The request already on its way for `key`, if any. */
  pending(key: K): Promise<V> | undefined {
    return this.flights.get(key);
  }

  /** The request on its way for `key`, or the one `start` begins (not called when one is). */
  run(key: K, start: () => Promise<V>): Promise<V> {
    const running = this.flights.get(key);
    if (running) return running;
    const flight = start();
    this.track([key], flight);
    return flight;
  }

  /** Register one request under several keys (one call answers all of them); each is released as above. */
  track(keys: readonly K[], flight: Promise<V>): void {
    for (const key of keys) this.flights.set(key, flight);
    const release = (): void => {
      for (const key of keys) if (this.flights.get(key) === flight) this.flights.delete(key);
    };
    flight.then(release, release);
  }

  clear(): void {
    this.flights.clear();
  }
}
