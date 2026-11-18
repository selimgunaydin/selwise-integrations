import { SingleFlight } from './single-flight.js';

describe('SingleFlight', () => {
  it('starts one request for callers that ask while it is on its way', async () => {
    const flights = new SingleFlight<string, number>();
    let answer!: (value: number) => void;
    const start = jest.fn(() => new Promise<number>((resolve) => (answer = resolve)));

    const first = flights.run('k', start);
    const second = flights.run('k', start);
    expect(second).toBe(first);
    expect(start).toHaveBeenCalledTimes(1);

    answer(4);
    await expect(Promise.all([first, second])).resolves.toEqual([4, 4]);
    expect(flights.pending('k')).toBeUndefined();
  });

  it('asks again once the answer has arrived', async () => {
    const flights = new SingleFlight<string, number>();
    const start = jest.fn(async () => 1);
    await flights.run('k', start);
    await flights.run('k', start);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('lets go of a request that failed, so the next caller asks afresh', async () => {
    const flights = new SingleFlight<string, number>();
    await expect(flights.run('k', () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(flights.pending('k')).toBeUndefined();
    await expect(flights.run('k', async () => 2)).resolves.toBe(2);
  });

  it('tracks one request under several keys and releases each', async () => {
    const flights = new SingleFlight<string, number>();
    let answer!: (value: number) => void;
    const request = new Promise<number>((resolve) => (answer = resolve));
    flights.track(['a', 'b'], request);
    expect(flights.pending('a')).toBe(request);
    expect(flights.pending('b')).toBe(request);

    answer(1);
    await request;
    await Promise.resolve();
    expect(flights.pending('a')).toBeUndefined();
    expect(flights.pending('b')).toBeUndefined();
  });

  it('never releases a newer request when an older one settles late', async () => {
    const flights = new SingleFlight<string, number>();
    let settleOld!: (value: number) => void;
    const old = new Promise<number>((resolve) => (settleOld = resolve));
    flights.track(['k'], old);
    // Replaced (a clear and a fresh ask) before the old one answered.
    flights.clear();
    const fresh = new Promise<number>(() => undefined);
    flights.track(['k'], fresh);

    settleOld(1);
    await old;
    await Promise.resolve();
    expect(flights.pending('k')).toBe(fresh);
  });
});
