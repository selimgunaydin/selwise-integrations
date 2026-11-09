import { AppPresence, isActiveAppState } from './presence.js';

const MINUTE = 60_000;

function setup(answer: { status: number; intervalMs?: number; live?: boolean } = { status: 200, intervalMs: MINUTE }) {
  let allowed = true;
  const send = jest.fn().mockResolvedValue(answer);
  const presence = new AppPresence({
    send,
    allowed: () => allowed,
    now: () => Date.now(),
    random: () => 0.5, // no jitter: exactly the interval
  });
  return {
    presence,
    send,
    setAllowed: (value: boolean) => {
      allowed = value;
    },
  };
}

describe('AppPresence', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends nothing until the server switches it on', async () => {
    const { presence, send } = setup();
    presence.configure(undefined);
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(send).not.toHaveBeenCalled();
  });

  it('beats every interval while the app is in the foreground', async () => {
    const { presence, send } = setup();
    presence.configure({ intervalMs: MINUTE });
    await jest.advanceTimersByTimeAsync(3 * MINUTE);
    expect(send).toHaveBeenCalledTimes(3);
    presence.stop();
  });

  it('stops in the background and beats at once when the app comes back', async () => {
    const { presence, send } = setup();
    presence.configure({ intervalMs: MINUTE });
    presence.setForeground(false);
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(send).not.toHaveBeenCalled();

    presence.setForeground(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    presence.stop();
  });

  it('sends nothing without consent, and resumes when it is given', async () => {
    const { presence, send, setAllowed } = setup();
    setAllowed(false);
    presence.configure({ intervalMs: MINUTE });
    await jest.advanceTimersByTimeAsync(2 * MINUTE);
    expect(send).not.toHaveBeenCalled();
    setAllowed(true);
    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(send).toHaveBeenCalledTimes(1);
    presence.stop();
  });

  it('sleeps after 30 minutes with no SDK call, and the next call wakes it', async () => {
    const { presence, send } = setup();
    presence.configure({ intervalMs: MINUTE });
    await jest.advanceTimersByTimeAsync(31 * MINUTE);
    const asleep = send.mock.calls.length;
    expect(asleep).toBeLessThanOrEqual(30);
    expect(jest.getTimerCount()).toBe(0);

    presence.noteActivity();
    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(send.mock.calls.length).toBe(asleep + 1);
    presence.stop();
  });

  it("follows the server's interval, never below 30 seconds", async () => {
    const { presence, send } = setup({ status: 200, intervalMs: 3 * MINUTE });
    presence.configure({ intervalMs: 1000 });
    await jest.advanceTimersByTimeAsync(29_000);
    expect(send).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2 * MINUTE);
    expect(send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(send).toHaveBeenCalledTimes(2);
    presence.stop();
  });

  it('stops for good on a wrong or unverified channel key, even if /config comes again', async () => {
    const { presence, send } = setup({ status: 403 });
    presence.configure({ intervalMs: MINUTE });
    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(send).toHaveBeenCalledTimes(1);
    presence.configure({ intervalMs: MINUTE });
    presence.setForeground(false);
    presence.setForeground(true);
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps beating after a network failure', async () => {
    const { presence, send } = setup();
    send.mockRejectedValueOnce(new TypeError('Network request failed'));
    presence.configure({ intervalMs: MINUTE });
    await jest.advanceTimersByTimeAsync(2 * MINUTE);
    expect(send).toHaveBeenCalledTimes(2);
    presence.stop();
  });

  it('skips a beat an accepted event batch covered', async () => {
    const { presence, send } = setup();
    presence.configure({ intervalMs: MINUTE });
    await jest.advanceTimersByTimeAsync(MINUTE / 2);
    presence.noteDelivered();
    await jest.advanceTimersByTimeAsync(MINUTE / 2);
    expect(send).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(send).toHaveBeenCalledTimes(1);
    presence.stop();
  });

  it('falls silent after live: false until the next accepted batch', async () => {
    const { presence, send } = setup({ status: 200, intervalMs: MINUTE, live: false });
    presence.configure({ intervalMs: MINUTE });
    await jest.advanceTimersByTimeAsync(4 * MINUTE);
    expect(send).toHaveBeenCalledTimes(1);

    presence.noteDelivered();
    await jest.advanceTimersByTimeAsync(2 * MINUTE);
    expect(send).toHaveBeenCalledTimes(2);
    presence.stop();
  });

  it('reads only "active" as in use', () => {
    expect(isActiveAppState('active')).toBe(true);
    expect(isActiveAppState('background')).toBe(false);
    expect(isActiveAppState('inactive')).toBe(false);
    expect(isActiveAppState(undefined)).toBe(false);
  });
});
