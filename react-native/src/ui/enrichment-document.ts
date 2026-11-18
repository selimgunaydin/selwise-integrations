/**
 * The document one enrichment SLOT renders into.
 *
 * ## One document per slot, not per rule
 *
 * A slot can stack several rules — a spec table above an FAQ above a shipping
 * note — and each is its own root in the markup the server already built. One
 * WebView per rule would mean three browser instances on a product screen; one
 * per slot means one, and the roots keep their identity because the server
 * stamps each with `data-selwise-entity-id`.
 *
 * That stamp is also how a click is attributed: with three rules in one
 * document, a tapped link belongs to whichever root contains it, and the
 * bridge walks up to find out. Reporting the slot instead would credit the
 * wrong rule two times out of three.
 *
 * ## No merchant JavaScript here, unlike a custom widget
 *
 * An enrichment block carries HTML and CSS and nothing else — there is no
 * `customJs` on the model. So this document injects only the bridge, and the
 * `track` / `addToCart` / `close` verbs a custom widget exposes are absent:
 * nothing in the page could call them. What is left is height reporting and
 * click attribution, which is the whole contract a rendered block needs.
 */

import { brandTokenCss } from '../vendor/theme-css.js';
import { isRecord } from '../core/records.js';
import { ENRICHMENT_ENTITY_ID_ATTR, ENRICHMENT_ROOT_ATTR } from './enrichment-attrs.js';

export { ENRICHMENT_ENTITY_ID_ATTR, ENRICHMENT_ROOT_ATTR };

const MESSAGE_TYPES = ['height', 'click'];

type UnknownRecord = Record<string, unknown>;

export interface EnrichmentDocumentOptions {
  background?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: string;
  /**
   * The slot's inner padding. Left unset, the document gives a block 16px of
   * side padding (`ENRICHMENT_DEFAULT_PADDING`) so its text does not touch the
   * screen edge, unless the block's own CSS pads its root.
   */
  padding?: string;
  /** An http(s) origin relative image sources resolve against. */
  baseUrl?: string;
  /**
   * The channel's brand theme (`client.getTheme()`), written into the document
   * as `:root` custom properties — what the storefront writes onto its page and
   * the dashboard's preview writes into its frame (`brandTokenCss`, one function
   * for all three). A block styled with `var(--selwise-brand, #111)` then paints
   * the brand on a phone, not its fallback: a WebView is a document of its own,
   * and a custom property does not cross into it.
   */
  tokens?: Readonly<Record<string, string>>;
}

export type EnrichmentMessage =
  | { type: 'height'; height: number }
  | { type: 'click'; url: string; assignmentId: string };

/**
 * The side padding of a slot whose host config and blocks set none: a phone
 * screen has no page margin, so a block's text would sit on the screen edge.
 */
export const ENRICHMENT_DEFAULT_PADDING = '0 16px';

const PADDING_DECLARATION = /(?:^|[;\s])padding(?:-left|-right|-inline(?:-start|-end)?)?\s*:/i;

/**
 * Does this block's own CSS pad its root? A rule counts when one of its
 * selectors ends at the block's root element (`[data-selwise-enrichment="b1"]`,
 * optionally with a class or pseudo-class) and declares a padding. A descendant
 * rule (`[data-selwise-enrichment="b1"] td`) pads something inside the block and
 * does not stand in for the page margin.
 */
export function cssPadsBlockRoot(css: string): boolean {
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(css)) !== null) {
    if (!PADDING_DECLARATION.test(match[2] ?? '')) continue;
    const endsAtRoot = (match[1] ?? '').split(',').some((selector) => {
      const trimmed = selector.trim();
      // The last compound selector: nothing after the root attribute but classes and pseudo-classes.
      return /\[data-selwise-(?:enrichment|root)(?:=[^\]]*)?\](?:[.:][\w-]+(?:\([^)]*\))?)*$/.test(trimmed);
    });
    if (endsAtRoot) return true;
  }
  return false;
}

/** Upper bound on one slot's markup. A runaway paste must not stall the thread. */
const MAX_DOCUMENT_BYTES = 512 * 1024;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The bridge, and only the two things this document can say.
 *
 * Height is measured on every layout change rather than once: a block that
 * loads an image or opens a `<details>` changes height after first paint, and a
 * one-shot measurement leaves it clipped for the rest of the session.
 */
export function bridgeScript(): string {
  return [
    '(function(){',
    '  var post = function(type, payload){',
    '    try {',
    '      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(',
    '        JSON.stringify({ __selwise: 1, type: type, payload: payload || {} })',
    '      );',
    '    } catch (e) {}',
    '  };',
    '  var last = 0;',
    '  var report = function(){',
    '    var el = document.getElementById("selwise-slot");',
    '    var h = el ? Math.ceil(el.getBoundingClientRect().height) : 0;',
    '    if (h > 0 && Math.abs(h - last) > 1) { last = h; post("height", { height: h }); }',
    '  };',
    '  window.addEventListener("load", report);',
    '  document.addEventListener("DOMContentLoaded", report);',
    '  if (typeof ResizeObserver === "function") {',
    '    try { new ResizeObserver(report).observe(document.getElementById("selwise-slot") || document.body); } catch (e) {}',
    '  }',
    '  setTimeout(report, 60); setTimeout(report, 400); setTimeout(report, 1200);',
    // Click attribution: walk up to the rule root that contains the target.
    // Capture phase, so a merchant's own handler cannot swallow it first.
    '  document.addEventListener("click", function(event){',
    '    var node = event.target;',
    '    var url = "";',
    '    var id = "";',
    '    var actionable = false;',
    '    while (node && node !== document) {',
    '      var tag = node.tagName;',
    '      if (tag === "A" || tag === "BUTTON" || tag === "SUMMARY" || (node.hasAttribute && node.hasAttribute("data-selwise-click"))) actionable = true;',
    '      if (!url && node.tagName === "A" && node.getAttribute("href")) url = node.getAttribute("href");',
    '      if (!id && node.hasAttribute && node.hasAttribute(' + JSON.stringify(ENRICHMENT_ENTITY_ID_ATTR) + ')) {',
    '        id = node.getAttribute(' + JSON.stringify(ENRICHMENT_ENTITY_ID_ATTR) + ');',
    '      }',
    '      node = node.parentNode;',
    '    }',
    '    if (actionable && (url || id)) post("click", { url: url, assignmentId: id });',
    '  }, true);',
    '})();',
  ].join('\n');
}

/**
 * One slot's rules into a single document.
 *
 * Returns null when there is nothing to draw, so the caller renders no WebView
 * at all rather than an empty one — an empty WebView is still a native view
 * with a measurement pass.
 */
export function buildEnrichmentDocument(
  items: readonly unknown[] | null | undefined,
  options?: EnrichmentDocumentOptions | null
): { html: string; ruleCount: number } | null {
  const list: readonly unknown[] = Array.isArray(items) ? items : [];
  const settings: UnknownRecord = isRecord(options) ? options : {};

  const bodies: string[] = [];
  const sheets: string[] = [];
  const seenCss = new Set<string>();
  let bytes = 0;

  for (const item of list) {
    if (!isRecord(item)) continue;
    const html = str(item.html);
    if (!html.trim()) continue;

    const css = str(item.css);
    const cost = html.length + css.length;
    if (bytes + cost > MAX_DOCUMENT_BYTES) continue;
    bytes += cost;

    bodies.push(html);
    // The server scopes each sheet to its own block wrapper, so a block shared
    // by two rules in one slot ships identical CSS twice. Deduplicated here
    // because the document is ours to assemble.
    if (css && !seenCss.has(css)) {
      seenCss.add(css);
      sheets.push(css);
    }
  }

  if (bodies.length === 0) return null;

  const background = str(settings.background).trim() || 'transparent';
  const textColor = str(settings.textColor).trim();
  const fontFamily =
    str(settings.fontFamily).trim() ||
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const fontSize = str(settings.fontSize).trim() || '14px';
  // The host's padding wins; otherwise a block that pads its own root keeps
  // exactly that, and every other block gets the default side padding.
  const padding =
    str(settings.padding).trim() || (sheets.some(cssPadsBlockRoot) ? '0px' : ENRICHMENT_DEFAULT_PADDING);

  const brand = brandTokenCss(isRecord(settings.tokens) ? (settings.tokens as Record<string, string>) : undefined);

  const html = [
    '<!doctype html><html><head>',
    '<meta charset="utf-8">',
    /^https?:\/\/[^\s"'<>]+$/i.test(str(settings.baseUrl).trim())
      ? '<base href="' + str(settings.baseUrl).trim().replace(/\/?$/, '/') + '">'
      : '',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
    // The brand first, so the base type below and every block's own CSS can read it.
    brand ? '<style>' + brand + '</style>' : '',
    '<style>',
    'html,body{margin:0;padding:0;background:transparent;-webkit-text-size-adjust:100%;}',
    // The base type is the host's, not the browser's default serif: an
    // unstyled block should look like it belongs to the app rather than like a
    // 1997 web page. Every merchant rule can still override it.
    // A block formatting context, so the first child's top margin and the last
    // one's bottom margin stay INSIDE the box that is measured: a block that
    // starts with a heading used to have its margin collapse out of the slot,
    // the reported height left the margin out and the block was clipped by it.
    // The fallback is the clearfix a WebView without `flow-root` (Chrome < 58) needs.
    '#selwise-slot{display:flow-root;padding:' + padding + ';background:' + background + ';' +
      'font-family:' + fontFamily + ';font-size:' + fontSize + ';' +
      (textColor ? 'color:' + textColor + ';' : '') +
      'line-height:1.45;}',
    '@supports not (display:flow-root){#selwise-slot:before,#selwise-slot:after{content:"";display:table;}}',
    '#selwise-slot img{max-width:100%;height:auto;}',
    '#selwise-slot table{border-collapse:collapse;width:100%;}',
    '</style>',
    sheets.length > 0 ? '<style>' + sheets.join('\n') + '</style>' : '',
    '</head><body>',
    '<div id="selwise-slot">' + bodies.join('') + '</div>',
    '<script>' + bridgeScript() + '</script>',
    '</body></html>',
  ].join('');

  return { html: html, ruleCount: bodies.length };
}

/**
 * A message from the WebView.
 *
 * Untrusted input from a page assembled out of merchant markup, so every field
 * is checked and anything unrecognised returns null rather than forwarded.
 */
export function parseEnrichmentMessage(raw: unknown): EnrichmentMessage | null {
  if (typeof raw !== 'string' || raw.length > 20000) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return null;
  }

  if (!isRecord(parsed) || parsed.__selwise !== 1) return null;
  if (MESSAGE_TYPES.indexOf(parsed.type as string) === -1) return null;

  const payload = isRecord(parsed.payload) ? parsed.payload : {};

  if (parsed.type === 'height') {
    const height = Number(payload.height);
    // A block cannot be taller than a few screens; a bad number would push the
    // rest of the product screen off.
    if (!Number.isFinite(height) || height <= 0 || height > 8000) return null;
    return { type: 'height', height: Math.ceil(height) };
  }

  const url = str(payload.url).trim();
  const assignmentId = str(payload.assignmentId).trim();
  if (!url && !assignmentId) return null;

  return {
    type: 'click',
    url: url.slice(0, 2048),
    assignmentId: assignmentId.slice(0, 64),
  };
}

export const MAX_ENRICHMENT_DOCUMENT_BYTES = MAX_DOCUMENT_BYTES;
