import { MemoryStorage, STORAGE_KEY_CLASS, STORAGE_KEYS } from './storage.js';
import { VisitorSignals } from './visitor-signals.js';

describe('the device keys', () => {
  it('has a decided class for every key, so a new key cannot be stored undecided', () => {
    expect(Object.keys(STORAGE_KEY_CLASS).sort()).toEqual(Object.values(STORAGE_KEYS).sort());
  });

  it('classes the visit counters as behaviour, and writes them only after analytics consent', async () => {
    expect(STORAGE_KEY_CLASS[STORAGE_KEYS.VISITS]).toBe('behaviour');
    const storage = new MemoryStorage();
    let analytics = false;
    const signals = new VisitorSignals(storage, () => 's1', () => analytics);
    signals.recordPageView(1000);
    expect(await storage.getItem(STORAGE_KEYS.VISITS)).toBeNull();
    analytics = true;
    signals.recordPageView(2000);
    await signals.flush();
    expect(await storage.getItem(STORAGE_KEYS.VISITS)).not.toBeNull();
  });
});
