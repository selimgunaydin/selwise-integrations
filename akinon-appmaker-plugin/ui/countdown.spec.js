'use strict';

const { remainingParts, countdownTargetOf, fixedCountdownTarget } = require('./countdown.js');
const { loadSdkModule } = require('../test/sdk-source.js');

// The SDK's own function, from its source: the plugin must agree with the
// contract, not with a stand-in written for this test.
const { countdownTarget } = loadSdkModule('vendor/dynamic-content.ts');

describe('remainingParts with an epoch target', () => {
  const NOW = Date.UTC(2026, 9, 6, 8, 0, 0);

  it('counts down to a number as well as to a date string', () => {
    expect(remainingParts(NOW + (2 * 3600 + 61) * 1000, NOW)).toEqual(['02', '01', '01']);
    expect(remainingParts(new Date(NOW + 61000).toISOString(), NOW)).toEqual(['00', '01', '01']);
  });

  it('is finished at or after the target', () => {
    expect(remainingParts(NOW, NOW)).toBeNull();
    expect(remainingParts(null, NOW)).toBeNull();
  });
});

describe('countdownTargetOf', () => {
  it('reads a fixed end date without the SDK, as before daily cutoffs', () => {
    const end = '2026-10-10T12:00:00.000Z';
    expect(countdownTargetOf({ endDate: end }, Date.now())).toBe(Date.parse(end));
    expect(fixedCountdownTarget({})).toBeNull();
  });

  // An app on an SDK that predates daily cutoffs has no target for one, and
  // draws nothing rather than a dash.
  it('has no target for a daily cutoff without the SDK', () => {
    expect(countdownTargetOf({ countdownMode: 'daily_cutoff', dailyCutoff: '14:00' }, Date.now())).toBeNull();
  });

  it('treats a throwing resolver as no target', () => {
    expect(
      countdownTargetOf({}, 0, () => {
        throw new Error('boom');
      })
    ).toBeNull();
  });
});

/**
 * "Orders before 14:00 ship today." The cutoff is the STORE's clock, and it
 * rolls over: once 14:00 passes, the countdown runs to tomorrow's 14:00 —
 * which only works because the overlay asks for the target on every tick.
 */
describe('a daily cutoff, rolling over', () => {
  const content = { countdownMode: 'daily_cutoff', dailyCutoff: '14:00', cutoffTimeZone: 'Europe/Istanbul' };
  // Istanbul is UTC+3 all year: 14:00 there is 11:00 UTC.
  const morning = Date.UTC(2026, 9, 6, 8, 0, 0); // 11:00 in Istanbul
  const justBefore = Date.UTC(2026, 9, 6, 10, 59, 59); // 13:59:59
  const justAfter = Date.UTC(2026, 9, 6, 11, 0, 1); // 14:00:01

  const remaining = (now) => remainingParts(countdownTargetOf(content, now, countdownTarget), now);

  it('counts to today’s cutoff while it is still ahead', () => {
    expect(remaining(morning)).toEqual(['03', '00', '00']);
    expect(remaining(justBefore)).toEqual(['00', '00', '01']);
  });

  it('counts to tomorrow’s once today’s has passed, instead of ending', () => {
    expect(remaining(justAfter)).toEqual(['23', '59', '59']);
  });

  // The store's clock, not the phone's: a shopper in London sees the same time left.
  it('is the same for every viewer', () => {
    expect(countdownTargetOf(content, morning, countdownTarget)).toBe(Date.UTC(2026, 9, 6, 11, 0, 0));
  });

  it('falls back to Istanbul for a time zone the builder does not offer', () => {
    const other = Object.assign({}, content, { cutoffTimeZone: 'Mars/Olympus' });
    expect(countdownTargetOf(other, morning, countdownTarget)).toBe(Date.UTC(2026, 9, 6, 11, 0, 0));
  });

  it('has no target for an unreadable cutoff', () => {
    const broken = Object.assign({}, content, { dailyCutoff: '25:00' });
    expect(remaining(morning)).not.toBeNull();
    expect(remainingParts(countdownTargetOf(broken, morning, countdownTarget), morning)).toBeNull();
  });
});
