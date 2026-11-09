import { EventQueue, type QueuedEvent } from './queue.js';
import { MemoryStorage, STORAGE_KEYS } from '../core/storage.js';

function makeEvent(name: string, overrides: Partial<QueuedEvent> = {}): QueuedEvent {
  return {
    eventId: `id-${name}`,
    entityType: 'custom',
    name,
    timestamp: 1000,
    eventTs: 1000,
    ...overrides,
  };
}

describe('EventQueue', () => {
  it('keeps the newest events when the cap is exceeded', () => {
    const queue = new EventQueue({ storage: new MemoryStorage(), maxQueueSize: 2 });

    queue.add(makeEvent('a'));
    queue.add(makeEvent('b'));
    queue.add(makeEvent('c'));

    expect(queue.size()).toBe(2);
    expect(queue.take(10).map((event) => event.name)).toEqual(['b', 'c']);
  });

  it('take() removes from the front and leaves the rest', () => {
    const queue = new EventQueue({ storage: new MemoryStorage(), maxQueueSize: 10 });
    queue.add(makeEvent('a'));
    queue.add(makeEvent('b'));
    queue.add(makeEvent('c'));

    expect(queue.take(2).map((event) => event.name)).toEqual(['a', 'b']);
    expect(queue.size()).toBe(1);
  });

  it('requeue() puts events back at the front so order survives a failed flush', () => {
    const queue = new EventQueue({ storage: new MemoryStorage(), maxQueueSize: 10 });
    queue.add(makeEvent('a'));
    queue.add(makeEvent('b'));

    const batch = queue.take(1);
    queue.requeue(batch);

    expect(queue.take(10).map((event) => event.name)).toEqual(['a', 'b']);
  });

  it('drops an event once it exhausts its retries', () => {
    const queue = new EventQueue({ storage: new MemoryStorage(), maxQueueSize: 10, maxRetries: 2 });
    queue.add(makeEvent('a'));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      queue.requeue(queue.take(1));
    }

    expect(queue.size()).toBe(0);
  });

  it('persists across instances so a killed app does not lose events', async () => {
    const storage = new MemoryStorage();
    const first = new EventQueue({ storage, maxQueueSize: 10 });

    first.add(makeEvent('a'));
    await first.flushWrites();

    const second = new EventQueue({ storage, maxQueueSize: 10 });
    await second.hydrate();

    expect(second.take(10).map((event) => event.name)).toEqual(['a']);
  });

  it('orders restored events before ones tracked during hydration', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify([makeEvent('old')]));

    const queue = new EventQueue({ storage, maxQueueSize: 10 });
    queue.add(makeEvent('new'));
    await queue.hydrate();

    expect(queue.take(10).map((event) => event.name)).toEqual(['old', 'new']);
  });

  it('discards a corrupt stored queue instead of failing every launch', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(STORAGE_KEYS.QUEUE, '{not json');

    const queue = new EventQueue({ storage, maxQueueSize: 10 });
    await queue.hydrate();

    expect(queue.size()).toBe(0);
    expect(await storage.getItem(STORAGE_KEYS.QUEUE)).toBeNull();
  });

  it('skips stored entries that are not events', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(
      STORAGE_KEYS.QUEUE,
      JSON.stringify([makeEvent('good'), { nonsense: true }, null])
    );

    const queue = new EventQueue({ storage, maxQueueSize: 10 });
    await queue.hydrate();

    expect(queue.take(10).map((event) => event.name)).toEqual(['good']);
  });
});
