'use strict';

const {
  resolveCustomCode,
  buildDocument,
  parseMessage,
  timedScript,
} = require('./custom-widget-document.js');

describe('resolveCustomCode', () => {
  // The alias lists mirror the browser renderer exactly: the dashboard has
  // written this content under several shapes over time, and a widget authored
  // under an older one must not come out blank in the app while it still
  // renders on the web.
  it('reads the flat shape', () => {
    expect(resolveCustomCode({ html: '<b>x</b>', css: 'b{}', javascript: 'x()' })).toMatchObject({
      html: '<b>x</b>', css: 'b{}', javascript: 'x()',
    });
  });

  it('reads the nested customCode shape', () => {
    expect(
      resolveCustomCode({ customCode: { html: '<i>y</i>', customCSS: 'i{}', js: 'y()' } })
    ).toMatchObject({ html: '<i>y</i>', css: 'i{}', javascript: 'y()' });
  });

  it('prefers the flat value when both are present', () => {
    expect(resolveCustomCode({ html: 'flat', customCode: { html: 'nested' } }).html).toBe('flat');
  });

  it('normalises the timing spellings', () => {
    expect(resolveCustomCode({ jsTiming: 'dom_ready' }).timing).toBe('domReady');
    expect(resolveCustomCode({ executionTiming: 'customEvent' }).timing).toBe('customEvent');
    expect(resolveCustomCode({}).timing).toBe('immediate');
  });

  it('tolerates nothing', () => {
    expect(resolveCustomCode(undefined).html).toBe('');
  });
});

describe('buildDocument', () => {
  const surface = {
    id: 'w-1',
    content: { html: '<button id="b">Al</button>', css: '#b{color:red}', javascript: 'selwise.track("x")' },
    styles: { containerPadding: '12px', containerBackground: '#fff' },
  };

  it('returns null with no html, so nothing renders an empty WebView', () => {
    expect(buildDocument({ id: 'w', content: { css: 'b{}' } })).toBeNull();
    expect(buildDocument(undefined)).toBeNull();
  });

  it('includes the merchant html, css and js', () => {
    const doc = buildDocument(surface);
    expect(doc.html).toContain('<button id="b">Al</button>');
    expect(doc.html).toContain('#b{color:red}');
    expect(doc.html).toContain('selwise.track("x")');
    expect(doc.hasScript).toBe(true);
  });

  // A WebView paints its own white ground; without this the merchant's
  // floating pill arrives as a white block.
  it('makes the document transparent and margin-free', () => {
    const doc = buildDocument(surface);
    expect(doc.html).toContain('background:transparent');
    expect(doc.html).toContain('margin:0');
  });

  it('applies the container padding and background the merchant set', () => {
    const doc = buildDocument(surface);
    expect(doc.html).toContain('padding:12px');
    expect(doc.html).toContain('background:#fff');
  });

  // Without a measured height every custom widget is clipped to a guess.
  it('injects the height reporter and the selwise api', () => {
    const doc = buildDocument(surface);
    expect(doc.html).toContain('ResizeObserver');
    expect(doc.html).toContain('window.selwise');
    expect(doc.html).toContain('addToCart');
  });

  it('carries the surface id, so a message can be attributed', () => {
    expect(buildDocument(surface).html).toContain('"w-1"');
  });
});

describe('timedScript', () => {
  it('runs immediately by default', () => {
    expect(timedScript('run()', 'immediate')).toBe('run()');
  });

  it('waits for DOMContentLoaded when asked', () => {
    const out = timedScript('run()', 'domReady');
    expect(out).toContain('DOMContentLoaded');
    // Must also cover the case where the document is already parsed.
    expect(out).toContain('readyState');
  });

  it('waits for a named event', () => {
    expect(timedScript('run()', 'customEvent', 'selwise:go')).toContain('"selwise:go"');
  });

  it('falls back to immediate when the event has no name', () => {
    expect(timedScript('run()', 'customEvent', '')).toBe('run()');
  });

  it('emits nothing for no code', () => {
    expect(timedScript('', 'domReady')).toBe('');
  });
});

describe('parseMessage', () => {
  const wrap = (type, payload) => JSON.stringify({ __selwise: 1, type, payload });

  it('reads a height report', () => {
    expect(parseMessage(wrap('height', { height: 120.4 }))).toEqual({ type: 'height', height: 121 });
  });

  // A bad number would push the whole native layout off screen.
  it('rejects an impossible height', () => {
    expect(parseMessage(wrap('height', { height: 0 }))).toBeNull();
    expect(parseMessage(wrap('height', { height: 99999 }))).toBeNull();
    expect(parseMessage(wrap('height', { height: 'tall' }))).toBeNull();
  });

  it('reads a track call with metadata', () => {
    expect(parseMessage(wrap('track', { name: 'promo_seen', metadata: { a: 1 } }))).toEqual({
      type: 'track', name: 'promo_seen', metadata: { a: 1 },
    });
  });

  it('reads an add to cart, defaulting the quantity', () => {
    expect(parseMessage(wrap('addToCart', { code: '1538' }))).toEqual({
      type: 'addToCart', code: '1538', quantity: 1,
    });
    expect(parseMessage(wrap('addToCart', { code: '1538', quantity: 3 })).quantity).toBe(3);
  });

  it('reads navigate and close', () => {
    expect(parseMessage(wrap('navigate', { url: '/list/' }))).toEqual({ type: 'navigate', url: '/list/' });
    expect(parseMessage(wrap('close', {}))).toEqual({ type: 'close' });
  });

  // Untrusted input from a page the merchant authored.
  it('ignores anything not from this bridge', () => {
    expect(parseMessage(JSON.stringify({ type: 'height', payload: { height: 10 } }))).toBeNull();
    expect(parseMessage('{"__selwise":1,"type":"eval","payload":{}}')).toBeNull();
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(null)).toBeNull();
  });

  it('ignores an oversized message rather than parsing it', () => {
    expect(parseMessage('x'.repeat(20001))).toBeNull();
  });

  it('rejects an empty or oversized code and name', () => {
    expect(parseMessage(wrap('addToCart', { code: '  ' }))).toBeNull();
    expect(parseMessage(wrap('track', { name: 'n'.repeat(65) }))).toBeNull();
    expect(parseMessage(wrap('navigate', { url: '' }))).toBeNull();
  });
});

describe('the dashboard custom-code fields', () => {
  // These are COLUMNS on the entity, not part of contentJson — and they are
  // where a merchant's code usually lands. Read only from contentJson, a
  // custom widget written in the dashboard rendered as an empty box in the app
  // while working on the web.
  it('reads customCss and customJs from the entity itself', () => {
    const code = resolveCustomCode(
      { html: '<p>merhaba</p>' },
      { customCss: '.a{color:red}', customJs: 'void 0' }
    );

    expect(code.css).toBe('.a{color:red}');
    expect(code.javascript).toBe('void 0');
  });

  // The browser widget reads the entity column first, then the content block.
  it('prefers the entity column over the content block, as the web does', () => {
    const code = resolveCustomCode(
      { html: '<p>x</p>', css: 'from content', customJs: 'from content' },
      { customCss: 'from entity', customJs: 'from entity' }
    );

    expect(code.css).toBe('from entity');
    expect(code.javascript).toBe('from entity');
  });

  it('still reads the content block when the entity carries nothing', () => {
    const code = resolveCustomCode({ html: '<p>x</p>', css: 'from content' }, {});
    expect(code.css).toBe('from content');
  });

  it('puts the entity-level code into the built document', () => {
    const document_ = buildDocument({
      type: 'custom',
      content: { html: '<div class="promo">Kampanya</div>' },
      customCss: '.promo{color:#d3145a}',
      customJs: 'window.selwise.track("promo_seen")',
    });

    expect(document_.html).toContain('.promo{color:#d3145a}');
    expect(document_.html).toContain('promo_seen');
    expect(document_.hasScript).toBe(true);
  });
});
