import { generateId, IdentityManager, normalizeSiteUserId, SESSION_TIMEOUT_MS } from './ids.js';
import { MemoryStorage, STORAGE_KEYS } from './storage.js';

describe('generateId', () => {
  it('produces a v4-shaped uuid', () => {
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('does not repeat across a large sample', () => {
    const ids = new Set(Array.from({ length: 5000 }, generateId));
    expect(ids.size).toBe(5000);
  });
});

describe('IdentityManager', () => {
  it('generates and persists a visitor id on first launch', async () => {
    const storage = new MemoryStorage();
    const identity = new IdentityManager(storage);
    await identity.ready();

    const visitorId = identity.getVisitorId();
    expect(visitorId).toBeTruthy();
    expect(await storage.getItem(STORAGE_KEYS.VISITOR_ID)).toBe(visitorId);
  });

  it('reuses the stored visitor id on a later launch', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(STORAGE_KEYS.VISITOR_ID, 'existing-visitor');

    const identity = new IdentityManager(storage);
    await identity.ready();

    expect(identity.getVisitorId()).toBe('existing-visitor');
  });

  it('resumes a session that is still inside the window', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(
      STORAGE_KEYS.SESSION,
      JSON.stringify({ id: 'live-session', lastActivityAt: Date.now() - 60_000 })
    );

    const identity = new IdentityManager(storage);
    await identity.ready();

    expect(identity.getSessionId()).toBe('live-session');
  });

  it('starts a new session when the stored one has expired', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(
      STORAGE_KEYS.SESSION,
      JSON.stringify({
        id: 'stale-session',
        lastActivityAt: Date.now() - (SESSION_TIMEOUT_MS + 1000),
      })
    );

    const identity = new IdentityManager(storage);
    await identity.ready();

    expect(identity.getSessionId()).not.toBe('stale-session');
  });

  it('rotates the session id once the window lapses mid-run', async () => {
    jest.useFakeTimers();
    try {
      const identity = new IdentityManager(new MemoryStorage());
      await identity.ready();

      const first = identity.getSessionId();
      jest.advanceTimersByTime(SESSION_TIMEOUT_MS + 1000);

      expect(identity.getSessionId()).not.toBe(first);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the session alive while activity continues', async () => {
    jest.useFakeTimers();
    try {
      const identity = new IdentityManager(new MemoryStorage());
      await identity.ready();

      const first = identity.getSessionId();
      // Three-quarters of the window, twice: without the touch-on-read the
      // second call would land past the timeout and rotate.
      jest.advanceTimersByTime(SESSION_TIMEOUT_MS * 0.75);
      expect(identity.getSessionId()).toBe(first);
      jest.advanceTimersByTime(SESSION_TIMEOUT_MS * 0.75);
      expect(identity.getSessionId()).toBe(first);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a corrupt stored session', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(STORAGE_KEYS.SESSION, 'not-json');

    const identity = new IdentityManager(storage);
    await identity.ready();

    expect(identity.getSessionId()).toBeTruthy();
  });

  it('resetSession keeps the visitor but drops the user and session', async () => {
    const identity = new IdentityManager(new MemoryStorage());
    await identity.ready();
    await identity.setSiteUserId('user-1');

    const visitorId = identity.getVisitorId();
    const sessionId = identity.getSessionId();

    await identity.resetSession();

    expect(identity.getVisitorId()).toBe(visitorId);
    expect(identity.getSiteUserId()).toBeNull();
    expect(identity.getSessionId()).not.toBe(sessionId);
  });

  it('hydrates only once for concurrent callers', async () => {
    const storage = new MemoryStorage();
    const setItem = jest.spyOn(storage, 'setItem');

    const identity = new IdentityManager(storage);
    await Promise.all([identity.ready(), identity.ready(), identity.ready()]);

    const visitorWrites = setItem.mock.calls.filter(
      (call) => call[0] === STORAGE_KEYS.VISITOR_ID
    );
    expect(visitorWrites).toHaveLength(1);
  });
});

describe('normalizeSiteUserId', () => {
  // An Akinon App Maker app keeps an auth.user for anonymous sessions with
  // `pk: false`; the plugin passed `String(false)`. It was stored, replayed on
  // every launch and attached to every event, so every anonymous visitor on
  // that install became the same customer.
  it('rejects the strings a boolean or a missing value stringifies into', () => {
    for (const value of ['false', 'true', 'null', 'undefined', ' false ']) {
      expect(normalizeSiteUserId(value)).toBeNull();
    }
  });

  it('rejects anything that is not a string or finite number', () => {
    expect(normalizeSiteUserId(false as unknown)).toBeNull();
    expect(normalizeSiteUserId(null)).toBeNull();
    expect(normalizeSiteUserId(undefined)).toBeNull();
    expect(normalizeSiteUserId(NaN)).toBeNull();
    expect(normalizeSiteUserId({} as unknown)).toBeNull();
    expect(normalizeSiteUserId('   ')).toBeNull();
  });

  it('keeps a real id, trimmed', () => {
    expect(normalizeSiteUserId('  u-44219 ')).toBe('u-44219');
    expect(normalizeSiteUserId(44219)).toBe('44219');
  });
});

describe('IdentityManager site user id', () => {
  it('never stores a value it would refuse to accept', async () => {
    const storage = new MemoryStorage();
    const identity = new IdentityManager(storage);
    await identity.ready();

    await identity.setSiteUserId('false');
    expect(identity.getSiteUserId()).toBeNull();
    expect(await storage.getItem(STORAGE_KEYS.SITE_USER_ID)).toBeNull();
  });

  // Self-healing: an install that already stored a bad id drops it on launch
  // instead of attaching it to events forever.
  it('discards a bad stored id on hydrate', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(STORAGE_KEYS.SITE_USER_ID, 'false');

    const identity = new IdentityManager(storage);
    await identity.ready();

    expect(identity.getSiteUserId()).toBeNull();
    expect(await storage.getItem(STORAGE_KEYS.SITE_USER_ID)).toBeNull();
  });

  it('keeps a good stored id', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(STORAGE_KEYS.SITE_USER_ID, '44219');

    const identity = new IdentityManager(storage);
    await identity.ready();

    expect(identity.getSiteUserId()).toBe('44219');
  });
});
