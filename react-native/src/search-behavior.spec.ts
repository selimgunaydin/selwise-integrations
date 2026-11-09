import { readSearchBehavior } from './client';

/**
 * The app's search hook starts from the channel's own behaviour
 * (`/search-config` → `settings.behavior`), so a storefront and an app search
 * on the same keystrokes. An answer it cannot read keeps the hook's defaults.
 */
describe('readSearchBehavior', () => {
  it('reads the two numbers the hook uses', () => {
    expect(
      readSearchBehavior({ settings: { behavior: { minChars: 3, debounceMs: 120, maxResults: 12, keepOpen: false } } }),
    ).toEqual({ minChars: 3, debounceMs: 120 });
  });

  it('is null for a channel that never configured search, or an older body', () => {
    expect(readSearchBehavior(null)).toBeNull();
    expect(readSearchBehavior({ enabled: false })).toBeNull();
    expect(readSearchBehavior({ minChars: 2, debounceMs: 300 })).toBeNull();
  });

  it('refuses a number outside the contract bounds instead of using it', () => {
    expect(readSearchBehavior({ settings: { behavior: { minChars: 0, debounceMs: 100 } } })).toBeNull();
    expect(readSearchBehavior({ settings: { behavior: { minChars: 2, debounceMs: 99999 } } })).toBeNull();
  });
});
