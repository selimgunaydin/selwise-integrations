import { MemoryStorage, STORAGE_KEYS } from './storage.js';
import { SAVE_DELAY_MS, VisitorSignals } from './visitor-signals.js';

const DAY = 24 * 60 * 60 * 1000;

function make(options: { session?: { id: string }; allowed?: () => boolean; storage?: MemoryStorage } = {}) {
  const session = options.session ?? { id: 's1' };
  const storage = options.storage ?? new MemoryStorage();
  const signals = new VisitorSignals(storage, () => session.id, options.allowed);
  return { signals, storage, session };
}

describe('VisitorSignals', () => {
  it('reads the device clock: hour, day of week and weekend', () => {
    const { signals } = make();
    // 2026-11-14 is a Saturday.
    const saturday = new Date(2026, 10, 14, 21, 30).getTime();
    expect(signals.snapshot(saturday)).toMatchObject({ hourOfDay: 21, dayOfWeek: 6, isWeekend: true });
    const monday = new Date(2026, 10, 16, 8, 0).getTime();
    expect(signals.snapshot(monday)).toMatchObject({ hourOfDay: 8, dayOfWeek: 1, isWeekend: false });
  });

  it('starts at the first visit and counts a new session as a new visit', () => {
    const { signals, session } = make();
    expect(signals.snapshot(1000)).toMatchObject({ visitCount: 1, sessionCount: 1, isReturningVisitor: false });
    expect(signals.snapshot(2000)).toMatchObject({ visitCount: 1 });
    session.id = 's2';
    expect(signals.snapshot(3000)).toMatchObject({ visitCount: 2, sessionCount: 2, isReturningVisitor: true });
  });

  it('measures the days since the first visit and since the last one', () => {
    const { signals, session } = make();
    const first = Date.UTC(2026, 9, 1, 12);
    signals.snapshot(first);
    signals.recordPageView(first + 1000);
    session.id = 's2';
    const later = first + 10 * DAY + 5000;
    expect(signals.snapshot(later)).toMatchObject({ daysSinceFirstVisit: 10, daysSinceLastVisit: 10 });
  });

  it('counts the session’s screens, products, searches and add-to-carts, and restarts them with the session', () => {
    const { signals, session } = make();
    signals.recordPageView(1000);
    signals.recordPageView(1100);
    signals.recordEvent('product_view', undefined, 1200);
    signals.recordEvent('add_to_cart', undefined, 1300);
    signals.recordEvent('add_to_cart', undefined, 1400);
    signals.recordEvent('search', { query: 'Ayakkabı' }, 1500);
    expect(signals.snapshot(1600)).toMatchObject({
      pageViewsThisSession: 2,
      productsViewedThisSession: 1,
      cartAddsThisSession: 2,
      searchesThisSession: 1,
    });
    session.id = 's2';
    expect(signals.snapshot(1700)).toMatchObject({ pageViewsThisSession: 0, productsViewedThisSession: 0, cartAddsThisSession: 0, searchesThisSession: 0 });
  });

  it('counts one search reported twice as one, and ignores events that are not searches', () => {
    const { signals } = make();
    signals.recordEvent('search', { query: ' Ayakkabı ' }, 1000);
    signals.recordEvent('search_zero_results', { query: 'ayakkabı' }, 1100);
    signals.recordEvent('search_close', { query: 'x' }, 1200);
    signals.recordEvent('search', { query: 'çanta' }, 1300);
    expect(signals.snapshot(1400).searchesThisSession).toBe(2);
  });

  it('keeps the visits across launches, but only on the device when the visitor’s answer allows it', async () => {
    const storage = new MemoryStorage();
    let allowed = false;
    const first = make({ storage, allowed: () => allowed });
    first.signals.snapshot(1000);
    first.signals.recordPageView(1100);
    expect(await storage.getItem(STORAGE_KEYS.VISITS)).toBeNull();

    allowed = true;
    first.signals.recordPageView(1200);
    await first.signals.flush();
    const stored = JSON.parse((await storage.getItem(STORAGE_KEYS.VISITS))!);
    expect(stored).toMatchObject({ visitCount: 1, pageViews: 2, sessionId: 's1' });

    // The next launch, a new session: the visit count carries on.
    const second = make({ storage, session: { id: 's2' }, allowed: () => true });
    await second.signals.hydrate();
    expect(second.signals.snapshot(5000)).toMatchObject({ visitCount: 2, isReturningVisitor: true, pageViewsThisSession: 0 });
  });

  it('resumes the same session’s counters after a relaunch inside it', async () => {
    const storage = new MemoryStorage();
    const first = make({ storage });
    first.signals.recordPageView(1000);
    first.signals.recordEvent('product_view', undefined, 1100);
    await first.signals.flush();
    const second = make({ storage });
    await second.signals.hydrate();
    expect(second.signals.snapshot(1200)).toMatchObject({ visitCount: 1, pageViewsThisSession: 1, productsViewedThisSession: 1 });
  });

  it('starts over from damaged storage', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(STORAGE_KEYS.VISITS, '{not json');
    const { signals } = make({ storage });
    await signals.hydrate();
    expect(signals.snapshot(1000)).toMatchObject({ visitCount: 1 });
  });

  describe('writes', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const writes = (storage: MemoryStorage) => jest.spyOn(storage, 'setItem');

    it('writes once for a burst of changes, and once for the first screen view of a session', async () => {
      const storage = new MemoryStorage();
      const spy = writes(storage);
      const { signals } = make({ storage });

      // The first view starts the session (a new record) AND counts a page view.
      signals.recordPageView(1000, 'home');
      signals.recordPageView(1100, 'product');
      signals.recordEvent('product_view', undefined, 1200);
      signals.recordEvent('add_to_cart', undefined, 1300);
      signals.recordEvent('search', { query: 'ayakkabı' }, 1400);
      expect(spy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(SAVE_DELAY_MS);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.parse((await storage.getItem(STORAGE_KEYS.VISITS))!)).toMatchObject({
        visitCount: 1,
        pageViews: 2,
        productsViewed: 1,
        cartAdds: 1,
        searches: 1,
        screens: { home: 1000, product: 1100 },
      });
    });

    it('opens a new window for the changes after a write', async () => {
      const storage = new MemoryStorage();
      const spy = writes(storage);
      const { signals } = make({ storage });

      signals.recordPageView(1000);
      await jest.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      signals.recordPageView(2000);
      signals.recordPageView(2100);
      await jest.advanceTimersByTimeAsync(SAVE_DELAY_MS);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(JSON.parse((await storage.getItem(STORAGE_KEYS.VISITS))!)).toMatchObject({ pageViews: 3 });
    });

    it('writes at once on flush, and loses nothing the app leaves behind', async () => {
      const storage = new MemoryStorage();
      const spy = writes(storage);
      const { signals } = make({ storage });

      signals.recordPageView(1000, 'basket');
      signals.recordEvent('add_to_cart', undefined, 1100);
      await signals.flush();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.parse((await storage.getItem(STORAGE_KEYS.VISITS))!)).toMatchObject({ pageViews: 1, cartAdds: 1, screens: { basket: 1000 } });

      // Nothing pending: the timer that was waiting writes nothing more, and a second flush neither.
      await jest.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
      await signals.flush();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('keeps a change made while the answer did not allow it, and writes it once it does', async () => {
      const storage = new MemoryStorage();
      const spy = writes(storage);
      let allowed = false;
      const { signals } = make({ storage, allowed: () => allowed });

      signals.recordPageView(1000);
      await jest.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(spy).not.toHaveBeenCalled();

      allowed = true;
      await signals.flush();
      expect(JSON.parse((await storage.getItem(STORAGE_KEYS.VISITS))!)).toMatchObject({ pageViews: 1 });
    });

    it('writes nothing after a clear', async () => {
      const storage = new MemoryStorage();
      const spy = writes(storage);
      const { signals } = make({ storage });

      signals.recordPageView(1000);
      await signals.clear();
      await jest.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);

      expect(spy).not.toHaveBeenCalled();
      expect(await storage.getItem(STORAGE_KEYS.VISITS)).toBeNull();
    });
  });
});
