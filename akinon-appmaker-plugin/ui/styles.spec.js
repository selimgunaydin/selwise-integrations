'use strict';

const {
  px, color, fontWeight, padding, shadow, borderRadius,
  containerStyle, textStyle, buttonStyle, overlayStyle,
  setThemeTokens, getThemeTokens, resolveVar, closeGlyphColor,
} = require('./styles.js');

describe('px', () => {
  it('reads the CSS lengths the dashboard writes', () => {
    expect(px('13px')).toBe(13);
    expect(px('420px')).toBe(420);
    expect(px(56)).toBe(56);
    expect(px('0.55')).toBe(0.55);
  });

  // RN silently ignores what it cannot parse, so 'auto' must become the
  // caller's fallback rather than reaching a style prop.
  it('treats auto and none as absent', () => {
    expect(px('auto')).toBeNull();
    expect(px('none')).toBeNull();
    expect(px('auto', 10)).toBe(10);
  });

  it('returns the fallback for junk', () => {
    expect(px('', 4)).toBe(4);
    expect(px(undefined, 4)).toBe(4);
    expect(px('wide', 4)).toBe(4);
    expect(px('wide')).toBeNull();
  });
});

describe('fontWeight', () => {
  // 'medium' is valid CSS, is what the dashboard writes, and RN throws it away:
  // the heading renders thin and looks like a broken theme.
  it('maps the CSS keywords RN does not accept', () => {
    expect(fontWeight('medium')).toBe('500');
    expect(fontWeight('semibold')).toBe('600');
    expect(fontWeight('regular')).toBe('400');
  });

  it('keeps what RN already understands', () => {
    expect(fontWeight('bold')).toBe('bold');
    expect(fontWeight('700')).toBe('700');
    expect(fontWeight(700)).toBe('700');
  });

  it('returns null for anything else, so the app default applies', () => {
    expect(fontWeight('heavier')).toBeNull();
    expect(fontWeight('750')).toBeNull();
    expect(fontWeight(null)).toBeNull();
  });
});

describe('padding', () => {
  // RN has no shorthand padding at all.
  it('splits CSS shorthand onto RN axes', () => {
    expect(padding('20px')).toEqual({ padding: 20 });
    expect(padding('10px 16px')).toEqual({ paddingVertical: 10, paddingHorizontal: 16 });
    expect(padding('4px 8px 12px')).toEqual({
      paddingTop: 4, paddingHorizontal: 8, paddingBottom: 12,
    });
    expect(padding('1px 2px 3px 4px')).toEqual({
      paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4,
    });
  });

  it('accepts a bare number and rejects nothing', () => {
    expect(padding(12)).toEqual({ padding: 12 });
    expect(padding('')).toBeNull();
    expect(padding(undefined)).toBeNull();
  });
});

describe('shadow', () => {
  it('sets both the iOS properties and the Android elevation', () => {
    const md = shadow('md');
    expect(md.elevation).toBe(4);
    expect(md.shadowOpacity).toBeGreaterThan(0);
    expect(md.shadowOffset).toEqual({ width: 0, height: 2 });
  });

  it('handles the whole scale the dashboard offers', () => {
    for (const name of ['none', 'sm', 'md', 'lg', 'xl', '2xl']) {
      expect(shadow(name)).not.toBeNull();
    }
  });

  // An explicit zero, not nothing: the app's own container style may carry a
  // shadow that has to be removed.
  it('makes none an explicit zero', () => {
    expect(shadow('none')).toMatchObject({ shadowOpacity: 0, elevation: 0 });
  });

  it('returns null for a name it does not know', () => {
    expect(shadow('huge')).toBeNull();
  });
});

describe('borderRadius', () => {
  it('resolves a percentage against the size the caller supplies', () => {
    expect(borderRadius('50%', 56)).toBe(28);
    expect(borderRadius('50%', undefined)).toBeNull();
  });

  it('reads a plain length', () => {
    expect(borderRadius('2px')).toBe(2);
  });
});

describe('containerStyle', () => {
  const styles = {
    backgroundColor: '#d3145a',
    padding: '10px 16px',
    borderRadius: '2px',
    shadow: 'md',
    maxWidth: '420px',
    fontSize: '13px',
  };

  it('builds a container from the real announcement-bar payload', () => {
    const result = containerStyle(styles);
    expect(result).toMatchObject({
      backgroundColor: '#d3145a',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 2,
      maxWidth: 420,
      elevation: 4,
    });
  });

  // A null in a style object is not the same as an absent key: it overwrites
  // whatever the app's own style put there.
  it('never emits a null value', () => {
    const result = containerStyle({ backgroundColor: '#fff' });
    expect(Object.values(result).some((value) => value === null)).toBe(false);
    expect(result).not.toHaveProperty('maxHeight');
  });

  it('only adds a border width when there is a border colour', () => {
    expect(containerStyle({ borderColor: '#ddd' }).borderWidth).toBe(1);
    expect(containerStyle({ borderWidth: '2px' })).not.toHaveProperty('borderWidth');
  });

  it('tolerates no styles at all', () => {
    expect(containerStyle(undefined)).toEqual({});
  });
});

describe('textStyle', () => {
  it('reads the default text keys', () => {
    expect(textStyle({ textColor: '#fff', fontSize: '13px', fontWeight: 'medium' })).toEqual({
      color: '#fff',
      fontSize: 13,
      fontWeight: '500',
    });
  });

  // Each surface type names its own text keys — titleFontSize, timerFontSize,
  // headlineFontSize — so the caller says which to read.
  it('reads the per-type keys when asked', () => {
    const styles = { titleFontSize: '24px', titleFontWeight: 'bold', textColor: '#1a1a1a' };
    expect(textStyle(styles, { sizeKey: 'titleFontSize', weightKey: 'titleFontWeight' })).toEqual({
      color: '#1a1a1a',
      fontSize: 24,
      fontWeight: 'bold',
    });
  });

  it('passes contentAlignment through only when RN accepts it', () => {
    expect(textStyle({ contentAlignment: 'center' }).textAlign).toBe('center');
    expect(textStyle({ contentAlignment: 'justify' })).not.toHaveProperty('textAlign');
  });
});

describe('buttonStyle', () => {
  it('splits the button keys into surface and label', () => {
    const result = buttonStyle({ buttonColor: '#fff', buttonTextColor: '#d3145a', buttonFullWidth: true });
    expect(result.container).toMatchObject({ backgroundColor: '#fff', alignSelf: 'stretch' });
    expect(result.label).toMatchObject({ color: '#d3145a', fontWeight: '600' });
  });

  it('leaves alignSelf out when the button is not full width', () => {
    expect(buttonStyle({ buttonColor: '#fff' }).container).not.toHaveProperty('alignSelf');
  });
});

describe('overlayStyle', () => {
  it('separates the scrim colour from its opacity, which RN cannot read as one', () => {
    expect(overlayStyle({ overlayColor: '#000000', overlayOpacity: 0.55 })).toEqual({
      backgroundColor: '#000000',
      opacity: 0.55,
    });
  });

  it('accepts an opacity written as a percentage number', () => {
    expect(overlayStyle({ overlayOpacity: 55 }).opacity).toBe(0.55);
  });

  it('falls back to a usable scrim when nothing is set', () => {
    expect(overlayStyle({})).toEqual({ backgroundColor: '#000000', opacity: 0.5 });
  });
});

describe('theme tokens', () => {
  afterEach(() => setThemeTokens({}));

  // Widget style DEFAULTS are literally this string
  // (packages/widget-contract/src/configs.ts), so a merchant who never touched
  // a colour ships one. RN has no cascade and no var(), so unresolved it
  // reached the native layer verbatim.
  it('resolves a token the merchant themed', () => {
    setThemeTokens({ '--selwise-brand': '#d3145a' });
    expect(color('var(--selwise-brand, #1a1a1a)')).toBe('#d3145a');
  });

  // The fallback inside the var() is what the web falls back to when a token is
  // unset, which is what makes an unthemed site look identical on both.
  it('uses the literal fallback when the token is unset', () => {
    expect(color('var(--selwise-brand, #1a1a1a)')).toBe('#1a1a1a');
  });

  it('follows a fallback that is itself a var()', () => {
    setThemeTokens({ '--selwise-secondary': '#00a3a3' });
    expect(color('var(--selwise-brand, var(--selwise-secondary, #000))')).toBe('#00a3a3');
  });

  it('returns null for a var() with no token and no fallback', () => {
    expect(color('var(--selwise-brand)')).toBeNull();
  });

  it('does not loop forever on a self-referencing chain', () => {
    setThemeTokens({});
    expect(() =>
      resolveVar('var(--a, var(--a, var(--a, var(--a, var(--a, var(--a, #fff)))))))')
    ).not.toThrow();
  });

  it('leaves a plain colour alone', () => {
    setThemeTokens({ '--selwise-brand': '#d3145a' });
    expect(color('#ffffff')).toBe('#ffffff');
    expect(color('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
  });

  // parseFloat('var(--selwise-radius, 8px)') is NaN, so an unresolved value
  // silently became the fallback ARGUMENT instead of the merchant's radius.
  it('resolves a token inside a numeric field', () => {
    setThemeTokens({ '--selwise-radius': '16px' });
    expect(px('var(--selwise-radius, 8px)', 4)).toBe(16);
    setThemeTokens({});
    expect(px('var(--selwise-radius, 8px)', 4)).toBe(8);
  });

  it('ignores a non-object theme', () => {
    setThemeTokens(null);
    expect(getThemeTokens()).toEqual({});
    setThemeTokens(['--selwise-brand', '#000']);
    expect(getThemeTokens()).toEqual({});
  });
});

describe('closeGlyphColor', () => {
  afterEach(() => setThemeTokens({}));

  it('is white on a brand-coloured bar, where the ground is the merchant colour', () => {
    expect(closeGlyphColor({ backgroundColor: '#d3145a' })).toBe('#ffffff');
  });

  /**
   * The bug this exists for. White on a white modal card is a popup with no
   * dismiss — the newsletter had exactly that on a real device while its
   * config said `showCloseButton: true`. `newsletter` is a type whose style
   * allow-list does not offer `closeButtonColor`, so a merchant could not
   * correct it either.
   */
  it('is dark on a modal card, so it can actually be seen', () => {
    expect(closeGlyphColor({ backgroundColor: '#ffffff' }, { onSurface: true })).toBe('#1a1a1a');
  });

  it('follows the card text colour when the merchant set one', () => {
    expect(
      closeGlyphColor({ backgroundColor: '#111', textColor: '#f5f5f5' }, { onSurface: true })
    ).toBe('#f5f5f5');
  });

  it('prefers an explicit closeButtonColor on either surface', () => {
    expect(closeGlyphColor({ closeButtonColor: '#00a3a3' })).toBe('#00a3a3');
    expect(closeGlyphColor({ closeButtonColor: '#00a3a3' }, { onSurface: true })).toBe('#00a3a3');
  });

  it('resolves a themed token like every other colour', () => {
    setThemeTokens({ '--selwise-text': '#222222' });
    expect(
      closeGlyphColor({ textColor: 'var(--selwise-text, #000)' }, { onSurface: true })
    ).toBe('#222222');
  });

  it('survives a missing style object', () => {
    expect(closeGlyphColor(undefined)).toBe('#ffffff');
    expect(closeGlyphColor(null, { onSurface: true })).toBe('#1a1a1a');
  });
});
