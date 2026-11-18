import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  buildEnrichmentDocument,
  parseEnrichmentMessage,
  MAX_ENRICHMENT_DOCUMENT_BYTES,
} from './enrichment-document.js';
import * as attrs from './enrichment-attrs.js';

/** One rendered rule, exactly as `app/enrichments` returns it. */
function item(overrides?: Record<string, unknown>) {
  return Object.assign(
    {
      assignmentId: 'rule-1',
      placementKey: 'pdp-specs',
      order: 0,
      html:
        '<div data-selwise-root="true" data-selwise-entity-type="enrichment" ' +
        'data-selwise-entity-id="rule-1"><div data-selwise-enrichment="b1">' +
        '<table><tr><td>Garanti</td><td>24 ay</td></tr></table></div></div>',
      css: '[data-selwise-enrichment="b1"] td { padding: 6px }',
    },
    overrides || {}
  );
}

// The contract that owns the attribute names is not a published package: a
// checkout that has only this package (the public mirror) cannot read it, and
// then there is nothing to compare the copy with.
const CONTRACT = path.join(__dirname, '../../../widget-contract/src/product-enrichment.ts');
const withContract = fs.existsSync(CONTRACT) ? describe : describe.skip;

withContract('the attribute names this package restates', () => {
  /**
   * The contract is not a dependency of this package, so it cannot import the
   * names. This is what keeps the copy honest.
   */
  it('match the contract they were copied from', () => {
    const contract = fs.readFileSync(CONTRACT, 'utf8');

    const declared = (name: string) => {
      const match = new RegExp('export const ' + name + " = '([^']+)'").exec(contract);
      return match ? match[1] : null;
    };

    expect(attrs.ENRICHMENT_ROOT_ATTR).toBe(declared('ENRICHMENT_ROOT_ATTR'));
    expect(attrs.ENRICHMENT_ENTITY_ID_ATTR).toBe(declared('ENRICHMENT_ENTITY_ID_ATTR'));
    expect(attrs.ENRICHMENT_ENTITY_TYPE_ATTR).toBe(declared('ENRICHMENT_ENTITY_TYPE_ATTR'));
    expect(attrs.ENRICHMENT_ENTITY_TYPE).toBe(declared('ENRICHMENT_ENTITY_TYPE'));
  });
});

describe('buildEnrichmentDocument', () => {
  it('puts the merchant markup and styles into one document', () => {
    const document_ = buildEnrichmentDocument([item()])!;

    expect(document_.html).toContain('24 ay');
    expect(document_.html).toContain('padding: 6px');
    expect(document_.ruleCount).toBe(1);
  });

  // One WebView per slot, not per rule: three rules on a product screen would
  // otherwise be three browser instances.
  it('stacks a slot rules into one document in the order given', () => {
    const document_ = buildEnrichmentDocument([
      item({ assignmentId: 'a', html: '<div data-selwise-entity-id="a">FIRST</div>' }),
      item({ assignmentId: 'b', html: '<div data-selwise-entity-id="b">SECOND</div>' }),
    ])!;

    expect(document_.ruleCount).toBe(2);
    expect(document_.html.indexOf('FIRST')).toBeLessThan(document_.html.indexOf('SECOND'));
  });

  it('ships a shared block stylesheet once', () => {
    const shared = '[data-selwise-enrichment="b1"] td { padding: 6px }';
    const document_ = buildEnrichmentDocument([
      item({ assignmentId: 'a', css: shared }),
      item({ assignmentId: 'b', css: shared }),
    ])!;

    expect(document_.html.split('padding: 6px').length - 1).toBe(1);
  });

  // An empty WebView is still a native view with a measurement pass.
  it('returns nothing when there is nothing to draw', () => {
    expect(buildEnrichmentDocument([])).toBeNull();
    expect(buildEnrichmentDocument(null)).toBeNull();
    expect(buildEnrichmentDocument([item({ html: '   ' })])).toBeNull();
    expect(buildEnrichmentDocument(['nope'])).toBeNull();
  });

  // A block with no styling of its own should look like it belongs to the app,
  // not like a browser default serif.
  it('applies the host base typography', () => {
    const document_ = buildEnrichmentDocument([item()], {
      textColor: '#1a1a1a',
      fontFamily: 'Inter, sans-serif',
      fontSize: '15px',
      padding: '16px',
      background: '#ffffff',
    })!;

    expect(document_.html).toContain('font-family:Inter, sans-serif');
    expect(document_.html).toContain('font-size:15px');
    expect(document_.html).toContain('color:#1a1a1a');
    expect(document_.html).toContain('padding:16px');
    expect(document_.html).toContain('background:#ffffff');
  });

  describe('default side padding', () => {
    const slotRule = (html: string) => /#selwise-slot\{[^}]*\}/.exec(html)![0];

    it('pads a block that sets no padding of its own, so text does not touch the screen edge', () => {
      expect(slotRule(buildEnrichmentDocument([item()])!.html)).toContain('padding:0 16px');
    });

    it('leaves a block alone whose own CSS pads its root', () => {
      for (const css of [
        '[data-selwise-enrichment="b1"] { padding: 12px 20px }',
        '[data-selwise-enrichment="b1"].care{padding-left:8px;color:red}',
        '@media (min-width:1px){[data-selwise-root] , [data-selwise-enrichment="b1"]{padding:4px}}',
      ]) {
        expect(slotRule(buildEnrichmentDocument([item({ css })])!.html)).toContain('padding:0px');
      }
    });

    it('is not switched off by padding inside the block (a table cell)', () => {
      const css = '[data-selwise-enrichment="b1"] td { padding: 6px } [data-selwise-enrichment="b1"] p{margin:0}';
      expect(slotRule(buildEnrichmentDocument([item({ css })])!.html)).toContain('padding:0 16px');
    });

    it("yields to the host's enrichment padding, whatever the block says", () => {
      const css = '[data-selwise-enrichment="b1"]{padding:20px}';
      expect(slotRule(buildEnrichmentDocument([item({ css })], { padding: '4px 8px' })!.html)).toContain(
        'padding:4px 8px'
      );
      expect(slotRule(buildEnrichmentDocument([item()], { padding: '0px' })!.html)).toContain('padding:0px');
    });
  });

  it('defaults to a transparent ground so it does not paint over the screen', () => {
    expect(buildEnrichmentDocument([item()])!.html).toContain('background:transparent');
  });

  it('keeps images and tables inside the viewport', () => {
    const html = buildEnrichmentDocument([item()])!.html;
    expect(html).toContain('#selwise-slot img{max-width:100%');
    expect(html).toContain('border-collapse:collapse');
  });

  it('keeps a block\'s own margins inside the box whose height it reports', () => {
    // a block that starts with a heading: its top margin must not collapse out
    // of #selwise-slot, or the measured height leaves the margin out and clips the block
    const html = buildEnrichmentDocument([item({ html: '<h3>Özellikler</h3><p>x</p>' })])!.html;
    expect(html).toMatch(/#selwise-slot\{display:flow-root;/);
    // and the clearfix for a WebView that predates flow-root
    expect(html).toContain('@supports not (display:flow-root)');
    expect(html).toContain('#selwise-slot:before,#selwise-slot:after{content:"";display:table;}');
  });

  it('reports height and attributes clicks from inside the document', () => {
    const html = buildEnrichmentDocument([item()])!.html;

    expect(html).toContain('ReactNativeWebView');
    expect(html).toContain('ResizeObserver');
    // Click attribution walks up to the rule root, so a tapped link in a
    // three-rule document credits the right rule.
    expect(html).toContain('data-selwise-entity-id');
  });

  it('counts a tap as a click only on something actionable, not on plain text', () => {
    const html = buildEnrichmentDocument([item()])!.html;

    expect(html).toContain('var actionable = false;');
    expect(html).toContain('actionable && (url || id)');
    expect(html).toContain('data-selwise-click');
  });

  // Enrichment blocks carry HTML and CSS and nothing else, so nothing in the
  // page can reach the app — the custom widget verbs are deliberately absent.
  it('exposes no window.selwise verbs, unlike a custom widget', () => {
    const html = buildEnrichmentDocument([item()])!.html;

    expect(html).not.toContain('window.selwise');
    expect(html).not.toContain('addToCart');
  });

  it('stops adding rules past the document cap rather than stalling the thread', () => {
    const big = 'x'.repeat(Math.floor(MAX_ENRICHMENT_DOCUMENT_BYTES / 2) + 1);
    const document_ = buildEnrichmentDocument([
      item({ assignmentId: 'a', html: '<div>' + big + '</div>', css: '' }),
      item({ assignmentId: 'b', html: '<div>' + big + '</div>', css: '' }),
      item({ assignmentId: 'c', html: '<div>' + big + '</div>', css: '' }),
    ])!;

    expect(document_.ruleCount).toBe(1);
  });
});

describe('parseEnrichmentMessage', () => {
  const wrap = (type: string, payload: unknown) =>
    JSON.stringify({ __selwise: 1, type: type, payload: payload });

  it('reads a height report', () => {
    expect(parseEnrichmentMessage(wrap('height', { height: 240.4 }))).toEqual({
      type: 'height',
      height: 241,
    });
  });

  // A bad number would push the rest of the product screen off.
  it('refuses an impossible height', () => {
    expect(parseEnrichmentMessage(wrap('height', { height: 0 }))).toBeNull();
    expect(parseEnrichmentMessage(wrap('height', { height: -5 }))).toBeNull();
    expect(parseEnrichmentMessage(wrap('height', { height: 99999 }))).toBeNull();
    expect(parseEnrichmentMessage(wrap('height', { height: 'tall' }))).toBeNull();
  });

  it('reads a click with the rule it belongs to', () => {
    expect(
      parseEnrichmentMessage(wrap('click', { url: '/kargo', assignmentId: 'rule-1' }))
    ).toEqual({ type: 'click', url: '/kargo', assignmentId: 'rule-1' });
  });

  it('accepts a click on a rule root with no link', () => {
    expect(parseEnrichmentMessage(wrap('click', { assignmentId: 'rule-1' }))).toEqual({
      type: 'click',
      url: '',
      assignmentId: 'rule-1',
    });
  });

  it('ignores a click that names neither a link nor a rule', () => {
    expect(parseEnrichmentMessage(wrap('click', {}))).toBeNull();
  });

  // Untrusted input from a page assembled out of merchant markup.
  it('refuses anything it does not recognise', () => {
    expect(parseEnrichmentMessage('not json')).toBeNull();
    expect(parseEnrichmentMessage(JSON.stringify({ type: 'height' }))).toBeNull();
    expect(parseEnrichmentMessage(wrap('exec', { code: 'rm -rf /' }))).toBeNull();
    expect(parseEnrichmentMessage(null)).toBeNull();
    expect(parseEnrichmentMessage('x'.repeat(20001))).toBeNull();
  });

  it('bounds the strings it forwards', () => {
    const message = parseEnrichmentMessage(
      wrap('click', { url: 'https://x/' + 'a'.repeat(5000), assignmentId: 'b'.repeat(200) })
    ) as { url: string; assignmentId: string };

    expect(message.url.length).toBe(2048);
    expect(message.assignmentId.length).toBe(64);
  });
});

describe('base url for relative images', () => {
  it('resolves relative sources against the shop when it is an http(s) origin', () => {
    const html = buildEnrichmentDocument([{ assignmentId: 'a', html: '<img src="/m/a.png">', css: '' }], {
      baseUrl: 'https://shop.example.com',
    })!.html;
    expect(html).toContain('<base href="https://shop.example.com/">');
  });

  it('writes no base for anything that is not a plain http(s) origin', () => {
    const html = buildEnrichmentDocument([{ assignmentId: 'a', html: '<p>x</p>', css: '' }], {
      baseUrl: 'javascript:alert(1)',
    })!.html;
    expect(html).not.toContain('<base');
  });
});

describe('the brand theme in the document', () => {
  const block = [{ assignmentId: 'a', html: '<p style="color:var(--selwise-brand, #111)">x</p>', css: '' }];

  it('writes every brand token as a :root custom property before the block, as the dashboard’s preview does', () => {
    const html = buildEnrichmentDocument(block, {
      tokens: { '--selwise-brand': '#d3145a', '--selwise-text': '#222222', 'selwise-radius': '6px' },
    })!.html;
    expect(html).toContain(':root { --selwise-brand: #d3145a; --selwise-text: #222222; --selwise-radius: 6px; }');
    // Before the base styles, so the block's own CSS reads the tokens.
    expect(html.indexOf(':root {')).toBeLessThan(html.indexOf('html,body{'));
  });

  it('is the dashboard’s function: one rule for the preview frame and the phone', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { brandTokenCss } = require('../vendor/theme-css.js') as typeof import('../vendor/theme-css.js');
    const tokens = { '--selwise-brand': '#d3145a', 'selwise-font': '"Inter", sans-serif' };
    expect(buildEnrichmentDocument(block, { tokens })!.html).toContain(brandTokenCss(tokens));
  });

  it('refuses a token that could close the block, and writes nothing for a channel with no brand', () => {
    const html = buildEnrichmentDocument(block, { tokens: { '--selwise-brand': '#fff; } body { display:none' } })!.html;
    expect(html).not.toContain('display:none');
    expect(html).not.toContain(':root');
    expect(buildEnrichmentDocument(block, {})!.html).not.toContain(':root');
  });
});
