'use strict';

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

const {
  ENRICHMENT_ROOT_ATTR,
  ENRICHMENT_ENTITY_ID_ATTR,
} = require('./enrichment-attrs.js');

const MESSAGE_TYPES = ['height', 'click'];

/** Upper bound on one slot's markup. A runaway paste must not stall the thread. */
const MAX_DOCUMENT_BYTES = 512 * 1024;

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * The bridge, and only the two things this document can say.
 *
 * Height is measured on every layout change rather than once: a block that
 * loads an image or opens a `<details>` changes height after first paint, and a
 * one-shot measurement leaves it clipped for the rest of the session.
 */
function bridgeScript() {
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
function buildEnrichmentDocument(items, options) {
  const list = Array.isArray(items) ? items : [];
  const settings = isRecord(options) ? options : {};

  const bodies = [];
  const sheets = [];
  const seenCss = new Set();
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
  const padding = str(settings.padding).trim() || '0px';

  const html = [
    '<!doctype html><html><head>',
    '<meta charset="utf-8">',
    /^https?:\/\/[^\s"'<>]+$/i.test(str(settings.baseUrl).trim())
      ? '<base href="' + str(settings.baseUrl).trim().replace(/\/?$/, '/') + '">'
      : '',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
    '<style>',
    'html,body{margin:0;padding:0;background:transparent;-webkit-text-size-adjust:100%;}',
    // The base type is the host's, not the browser's default serif: an
    // unstyled block should look like it belongs to the app rather than like a
    // 1997 web page. Every merchant rule can still override it.
    '#selwise-slot{padding:' + padding + ';background:' + background + ';' +
      'font-family:' + fontFamily + ';font-size:' + fontSize + ';' +
      (textColor ? 'color:' + textColor + ';' : '') +
      'line-height:1.45;}',
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
function parseEnrichmentMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 20000) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return null;
  }

  if (!isRecord(parsed) || parsed.__selwise !== 1) return null;
  if (MESSAGE_TYPES.indexOf(parsed.type) === -1) return null;

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

module.exports = {
  buildEnrichmentDocument,
  parseEnrichmentMessage,
  MAX_ENRICHMENT_DOCUMENT_BYTES: MAX_DOCUMENT_BYTES,
  ENRICHMENT_ROOT_ATTR,
  ENRICHMENT_ENTITY_ID_ATTR,
};
