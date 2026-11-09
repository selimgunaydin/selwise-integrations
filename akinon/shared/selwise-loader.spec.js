const path = require('path');

function loadLoader() {
  const modulePath = path.join(__dirname, 'selwise-loader.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

describe('resolveSiteKey', () => {
  let resolveSiteKey;
  let SITE_KEYS;

  beforeEach(() => {
    const loader = loadLoader();
    resolveSiteKey = loader.resolveSiteKey;
    SITE_KEYS = loader.SITE_KEYS;

    Object.assign(SITE_KEYS, {
      'brand.pl': 'KEY_PL',
      'brand.kz': 'KEY_KZ',
      'staging.brand.pl': 'KEY_PL_STAGING',
    });
  });

  it('matches an exact hostname', () => {
    expect(resolveSiteKey('brand.pl')).toBe('KEY_PL');
    expect(resolveSiteKey('brand.kz')).toBe('KEY_KZ');
  });

  it('lets a subdomain inherit its market', () => {
    expect(resolveSiteKey('www.brand.pl')).toBe('KEY_PL');
  });

  it('prefers the longest configured suffix so staging wins over production', () => {
    // Both `brand.pl` and `staging.brand.pl` are suffixes of the host; the
    // more specific one must win, or staging traffic lands in production.
    expect(resolveSiteKey('www.staging.brand.pl')).toBe('KEY_PL_STAGING');
    expect(resolveSiteKey('staging.brand.pl')).toBe('KEY_PL_STAGING');
  });

  it('is case- and trailing-dot-insensitive', () => {
    expect(resolveSiteKey('WWW.Brand.PL')).toBe('KEY_PL');
    expect(resolveSiteKey('brand.pl.')).toBe('KEY_PL');
  });

  it('does not match a lookalike domain', () => {
    // Suffix matching must be on a dot boundary, not a substring.
    expect(resolveSiteKey('notbrand.pl')).toBeNull();
    expect(resolveSiteKey('brand.pl.evil.com')).toBeNull();
  });

  it('returns null for an unmapped host rather than defaulting', () => {
    // A default key would file a staging or preview visit as production revenue.
    expect(resolveSiteKey('preview.vercel.app')).toBeNull();
    expect(resolveSiteKey('localhost')).toBeNull();
    expect(resolveSiteKey('')).toBeNull();
    expect(resolveSiteKey(null)).toBeNull();
    expect(resolveSiteKey(undefined)).toBeNull();
  });
});
