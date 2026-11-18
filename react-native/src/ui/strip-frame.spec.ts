import { APP_STYLE_TABLE } from '../vendor/app-style.js';
import { stripFrameOf, dotGeometry, STRIP_PHONE_PADDING } from './strip-frame.js';

/**
 * The strip's frame: its heading, container and page dots, as the style table
 * (`app-style`, the `strip` surface) translates them. Every key the dashboard
 * offers on an app channel for these blocks is proved drawn below — the proof the
 * pending list (`APP_PENDING_FIELDS`) is held to.
 */

const ctx = { tokens: { '--selwise-text': '#222222', '--selwise-text-muted': '#555555' } };

describe('the strip frame', () => {
  it('draws the web’s defaults, with the brand behind the colours', () => {
    const frame = stripFrameOf({ id: 'w', title: 'Önerilenler', titleStyles: { enabled: true }, subtitle: 'Sizin için', subtitleStyles: { enabled: true } }, ctx);
    expect(frame.title).toEqual({
      text: 'Önerilenler',
      style: { fontSize: 24, fontWeight: '700', color: '#222222', textAlign: 'left', marginBottom: 16 },
    });
    expect(frame.subtitle?.style).toMatchObject({ fontSize: 14, fontWeight: '400', color: '#555555', marginBottom: 24 });
    // An unthemed channel draws the literal the web does.
    expect(stripFrameOf({ id: 'w', title: 'A', titleStyles: { enabled: true } }, { tokens: {} }).title?.style.color).toBe('#111111');
  });

  it('draws a heading only when it is switched on and has words, as the web does', () => {
    expect(stripFrameOf({ id: 'w', title: 'A', titleStyles: { enabled: false } }, ctx).title).toBeNull();
    expect(stripFrameOf({ id: 'w', title: '', name: 'PDP — iç ad', titleStyles: { enabled: true } }, ctx).title).toBeNull();
    // The screen’s own heading is drawn whatever the merchant’s switch says.
    expect(stripFrameOf({ id: 'w', title: 'A', titleStyles: { enabled: false } }, ctx, 'Benim başlığım').title?.text).toBe('Benim başlığım');
    // A strip a host built by hand carries no block: its title, then its internal name as the last resort.
    expect(stripFrameOf({ id: 'w', name: 'İç ad' }, ctx).title?.text).toBe('İç ad');
    expect(stripFrameOf({ id: 'w', title: 'Başlık', name: 'İç ad' }, ctx).title?.text).toBe('Başlık');
  });

  it('draws the subtitle only with words and a switch that is on', () => {
    expect(stripFrameOf({ id: 'w', subtitle: 'x', subtitleStyles: { enabled: false } }, ctx).subtitle).toBeNull();
    expect(stripFrameOf({ id: 'w', subtitle: '', subtitleStyles: { enabled: true } }, ctx).subtitle).toBeNull();
  });

  it('keeps the dot geometry of the storefront', () => {
    expect(dotGeometry('circle', 10)).toEqual({ width: 10, height: 10, radius: 5 });
    expect(dotGeometry('bar', 10)).toEqual({ width: 20, height: 10, radius: 5 });
    expect(dotGeometry('line', 10)).toEqual({ width: 30, height: 5, radius: 2 });
  });

  it('fills the width for a centred container: `margin: 0 auto` is a cap, not a shrink-wrap', () => {
    const frame = stripFrameOf({ id: 'w', containerStyles: { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' } }, ctx);
    // `alignSelf: center` alone wraps the view to its content in RN; the cards are sized by this box.
    expect(frame.container).toMatchObject({ alignSelf: 'center', width: '100%', maxWidth: 1200 });
    // No auto margin: the container already stretches, nothing is added.
    expect(stripFrameOf({ id: 'w', containerStyles: { padding: '10px', margin: '4px 8px' } }, ctx).container).not.toHaveProperty('width');
  });

  it('draws a stored padding as typed, and a strip with none at the phone inset', () => {
    const container = (containerStyles?: unknown) => stripFrameOf({ id: 'w', containerStyles }, ctx).container;
    expect(container({ padding: '40px 20px' })).toMatchObject({ paddingVertical: 40, paddingHorizontal: 20 });
    expect(container({ padding: '8px' })).toMatchObject({ padding: 8 });
    expect(container({ padding: '0px' })).toMatchObject({ padding: 0 });
    expect(container({ padding: '0px' })).not.toHaveProperty('paddingVertical');
    expect(container()).toMatchObject({ paddingVertical: STRIP_PHONE_PADDING.vertical, paddingHorizontal: STRIP_PHONE_PADDING.horizontal });
    expect(container({ backgroundColor: '#fff' })).toMatchObject({ paddingVertical: 16, paddingHorizontal: 16 });
  });

  it('drops a maximum width of auto, which RN does not take', () => {
    expect(stripFrameOf({ id: 'w', containerStyles: { maxWidth: 'auto', padding: '0px' } }, ctx).container).not.toHaveProperty('maxWidth');
    expect(stripFrameOf({ id: 'w', containerStyles: { maxWidth: '100%' } }, ctx).container).toMatchObject({ maxWidth: '100%' });
  });

  describe('every strip style key the dashboard offers on an app channel is drawn', () => {
    // A value of each key that the table translates, and the property it lands on.
    const SAMPLES: Record<string, { value: unknown; expect: (frame: ReturnType<typeof stripFrameOf>) => unknown }> = {
      'dotStyles.enabled': { value: false, expect: (f) => f.dots !== null },
      'dotStyles.style': { value: 'bar', expect: (f) => f.dots?.width },
      'dotStyles.size': { value: 12, expect: (f) => f.dots?.height },
      'dotStyles.color': { value: '#aaaaaa', expect: (f) => f.dots?.color },
      'dotStyles.activeColor': { value: '#bb0000', expect: (f) => f.dots?.activeColor },
      'dotStyles.gap': { value: 3, expect: (f) => f.dots?.gap },
      'dotStyles.offset': { value: 20, expect: (f) => f.dots?.offset },
      'containerStyles.backgroundColor': { value: '#f0f0f0', expect: (f) => f.container['backgroundColor'] },
      'containerStyles.padding': { value: '8px 12px', expect: (f) => f.container['paddingHorizontal'] },
      'containerStyles.borderRadius': { value: 6, expect: (f) => f.container['borderRadius'] },
      'containerStyles.maxWidth': { value: '320px', expect: (f) => f.container['maxWidth'] },
      'containerStyles.margin': { value: '4px 8px', expect: (f) => f.container['marginHorizontal'] },
    };
    for (const section of ['titleStyles', 'subtitleStyles'] as const) {
      SAMPLES[`${section}.enabled`] = { value: false, expect: (f) => (section === 'titleStyles' ? f.title : f.subtitle) };
      SAMPLES[`${section}.fontSize`] = { value: 31, expect: (f) => (section === 'titleStyles' ? f.title : f.subtitle)?.style.fontSize };
      SAMPLES[`${section}.fontWeight`] = { value: 'semibold', expect: (f) => (section === 'titleStyles' ? f.title : f.subtitle)?.style.fontWeight };
      SAMPLES[`${section}.color`] = { value: '#123456', expect: (f) => (section === 'titleStyles' ? f.title : f.subtitle)?.style.color };
      SAMPLES[`${section}.textAlign`] = { value: 'center', expect: (f) => (section === 'titleStyles' ? f.title : f.subtitle)?.style.textAlign };
      SAMPLES[`${section}.marginBottom`] = { value: 40, expect: (f) => (section === 'titleStyles' ? f.title : f.subtitle)?.style.marginBottom };
    }

    it('has a proof for every translated key', () => {
      expect(Object.keys(SAMPLES).sort()).toEqual(Object.keys(APP_STYLE_TABLE.strip).sort());
    });

    for (const id of Object.keys(APP_STYLE_TABLE.strip)) {
      it(`${id} reaches the frame`, () => {
        const [section = '', key = ''] = id.split('.');
        const sample = SAMPLES[id]!;
        // The blocks the API sends, with the switch on; the sample then moves one key.
        const base: Record<string, unknown> = {
          id: 'w',
          title: 'Başlık',
          subtitle: 'Alt başlık',
          titleStyles: { enabled: true },
          subtitleStyles: { enabled: true },
          containerStyles: {},
          dotStyles: { enabled: true },
        };
        const before = stripFrameOf(base, ctx);
        const after = stripFrameOf({ ...base, [section]: { ...(base[section] as object), [key]: sample.value } }, ctx);
        expect(sample.expect(after)).not.toEqual(sample.expect(before));
      });
    }
  });
});
