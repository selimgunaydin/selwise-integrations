'use strict';

const { SIGNAL, resolveTrigger, isModal } = require('./triggers.js');

describe('resolveTrigger', () => {
  it('waits for a timer when the merchant set a delay', () => {
    expect(resolveTrigger({ triggerStrategy: 'delay', triggerDelaySeconds: 5 })).toEqual({
      signal: SIGNAL.TIMER, delayMs: 5000, eventName: null, degraded: null,
    });
  });

  it('shows a zero-second delay immediately rather than scheduling nothing', () => {
    expect(resolveTrigger({ triggerStrategy: 'delay', triggerDelaySeconds: 0 }).signal).toBe(
      SIGNAL.IMMEDIATE
    );
  });

  // There is no pointer to leave the viewport. Firing on a timer instead would
  // interrupt someone who is still shopping, which is worse than not showing it.
  it('maps exit intent to the app leaving, not to a timer', () => {
    const result = resolveTrigger({ triggerStrategy: 'exit_intent', triggerDelaySeconds: 5 });
    expect(result.signal).toBe(SIGNAL.APP_BACKGROUND);
    expect(result.delayMs).toBe(0);
  });

  // Degrading is fine; degrading silently is not.
  it('degrades scroll depth and says so', () => {
    const result = resolveTrigger({ triggerStrategy: 'scroll', triggerScrollPercent: 50 });
    expect(result.signal).toBe(SIGNAL.IMMEDIATE);
    expect(result.degraded).toMatch(/scroll/i);
  });

  it('waits for a named event', () => {
    expect(resolveTrigger({ triggerStrategy: 'event', triggerEventName: 'selwise:open' })).toEqual({
      signal: SIGNAL.EVENT, delayMs: 0, eventName: 'selwise:open', degraded: null,
    });
  });

  it('degrades an event strategy with no event name', () => {
    const result = resolveTrigger({ triggerStrategy: 'event', triggerEventName: '  ' });
    expect(result.signal).toBe(SIGNAL.IMMEDIATE);
    expect(result.degraded).toMatch(/event name/i);
  });

  it('defaults to immediate for anything unknown or missing', () => {
    expect(resolveTrigger({}).signal).toBe(SIGNAL.IMMEDIATE);
    expect(resolveTrigger(undefined).signal).toBe(SIGNAL.IMMEDIATE);
    expect(resolveTrigger({ triggerStrategy: 'telepathy' }).signal).toBe(SIGNAL.IMMEDIATE);
  });
});

describe('isModal', () => {
  it('knows which types take over the screen', () => {
    expect(isModal('exit_intent_popup')).toBe(true);
    expect(isModal('slide_in')).toBe(true);
    expect(isModal('newsletter')).toBe(true);
  });

  it('treats furniture as furniture', () => {
    for (const type of ['announcement_bar', 'sticky_footer', 'floating_button', 'cart_count']) {
      expect(isModal(type)).toBe(false);
    }
  });

  it('tolerates nothing', () => {
    expect(isModal(undefined)).toBe(false);
  });
});

describe('remainingParts', () => {
  const { remainingParts } = require('./countdown.js');

  // `now` is injected rather than read from the clock: a test that computes an
  // end date from `Date.now()` and then calls twice loses a millisecond between
  // the calls, and "exactly three days" floors to two.
  const NOW = Date.parse('2026-09-10T12:00:00.000Z');

  it('counts down in hours when the end is today', () => {
    const end = new Date(NOW + 2 * 3600 * 1000 + 61 * 1000).toISOString();
    expect(remainingParts(end, NOW)).toEqual(['02', '01', '01']);
  });

  it('adds a day part when the end is further out', () => {
    const end = new Date(NOW + 3 * 86400 * 1000).toISOString();
    expect(remainingParts(end, NOW)).toEqual(['3g', '00', '00', '00']);
  });

  // A finished countdown must render as finished, not as 00:00:00 forever or as
  // a negative number.
  it('returns null once the deadline has passed', () => {
    expect(remainingParts(new Date(NOW - 1000).toISOString(), NOW)).toBeNull();
  });

  it('returns null for a date it cannot parse', () => {
    expect(remainingParts('yarın')).toBeNull();
    expect(remainingParts(undefined)).toBeNull();
  });
});
