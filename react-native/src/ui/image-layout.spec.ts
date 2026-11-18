import { FALLBACK_ASPECT_RATIO, imageAddress, imageLayout, isSvgAddress } from './image-layout.js';

describe('imageLayout', () => {
  it('lays the bar’s picture as a 24px thumbnail by default, and at the merchant’s size and corners', () => {
    expect(imageLayout('announcement_bar', {})).toMatchObject({ mode: 'thumbnail', spacing: 8, style: { width: 24, height: 24, borderRadius: 4 } });
    expect(imageLayout('announcement_bar', { imageSize: '40px', imageBorderRadius: '50%', imageSpacing: '12px' })).toMatchObject({
      spacing: 12,
      style: { width: 40, height: 40 },
    });
    // The bar has no other mode, whatever a record carries.
    expect(imageLayout('announcement_bar', { imageMode: 'cover' }).mode).toBe('thumbnail');
  });

  it('lays a popup’s picture above its words at 16:9 by default', () => {
    expect(imageLayout('exit_intent_popup', {})).toMatchObject({
      mode: 'cover',
      position: 'top',
      horizontal: false,
      bleed: false,
      aspectRatio: 16 / 9,
      resizeMode: 'cover',
      style: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12 },
    });
  });

  it('reads every image key of the dashboard', () => {
    const layout = imageLayout('exit_intent_popup', {
      imageMode: 'cover',
      imagePosition: 'left',
      imageWidth: '140px',
      imageAspectRatio: '1/1',
      imageObjectFit: 'contain',
      imageBorderRadius: '6px',
      imageSpacing: '20px',
    });
    expect(layout).toMatchObject({ horizontal: true, position: 'left', spacing: 20, resizeMode: 'contain', style: { width: 140, aspectRatio: 1, borderRadius: 6 } });
    expect(imageLayout('exit_intent_popup', { imageObjectFit: 'fill' }).resizeMode).toBe('stretch');
  });

  it('lets a picture bleed only when it is a full picture above or below the words', () => {
    expect(imageLayout('exit_intent_popup', { imageBleed: true })).toMatchObject({ bleed: true, style: { borderRadius: 0 } });
    expect(imageLayout('exit_intent_popup', { imageBleed: true, imagePosition: 'bottom' }).bleed).toBe(true);
    expect(imageLayout('exit_intent_popup', { imageBleed: true, imagePosition: 'left' }).bleed).toBe(false);
    expect(imageLayout('exit_intent_popup', { imageBleed: true, imageMode: 'thumbnail' }).bleed).toBe(false);
  });

  it('squares a full-width picture’s corners', () => {
    expect(imageLayout('exit_intent_popup', { imageMode: 'fullWidth', imageBorderRadius: '20px' }).style.borderRadius).toBe(0);
  });

  it('gives the slide-in its own defaults: stacked, 8px corners, the picture’s own ratio', () => {
    expect(imageLayout('slide_in', {})).toMatchObject({ mode: 'cover', position: 'top', aspectRatio: 'auto', style: { width: '100%', borderRadius: 8 } });
    // The slide-in never lays a picture beside its words.
    expect(imageLayout('slide_in', { imagePosition: 'left' }).horizontal).toBe(false);
  });

  it('keeps an explicit auto ratio auto, and a missing one the type’s', () => {
    expect(imageLayout('exit_intent_popup', { imageAspectRatio: 'auto' }).aspectRatio).toBe('auto');
    expect(imageLayout('exit_intent_popup', {}).aspectRatio).toBeCloseTo(FALLBACK_ASPECT_RATIO);
  });
});

describe('the address of a picture', () => {
  it('accepts https, http and an inline image, and resolves a relative path against the storefront', () => {
    expect(imageAddress('https://cdn.test/a.png')).toBe('https://cdn.test/a.png');
    expect(imageAddress('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(imageAddress('/media/a.png', 'https://shop.test/')).toBe('https://shop.test/media/a.png');
  });

  it('rejects what an app may not draw', () => {
    expect(imageAddress('/media/a.png')).toBeNull();
    expect(imageAddress('//evil.test/a.png', 'https://shop.test')).toBeNull();
    expect(imageAddress('javascript:alert(1)')).toBeNull();
    expect(imageAddress('')).toBeNull();
    expect(imageAddress(undefined)).toBeNull();
  });

  it('knows an SVG', () => {
    expect(isSvgAddress('https://cdn.test/a.svg?v=2')).toBe(true);
    expect(isSvgAddress('data:image/svg+xml;base64,AAAA')).toBe(true);
    expect(isSvgAddress('https://cdn.test/a.png')).toBe(false);
  });
});
