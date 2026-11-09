'use strict';

/**
 * Builds the HTML document a custom widget runs in, and reads what it sends back.
 *
 * ## Why a WebView at all
 *
 * A `custom` widget is not a widget with custom colours — it is the merchant's
 * own HTML, CSS and JavaScript, injected into the page by the browser widget
 * and executed by `ScriptExecutor`. There is no native translation of that:
 * arbitrary CSS has no React Native equivalent and arbitrary JavaScript has
 * nowhere to run. Anything short of a real browser context would render some
 * merchants' widgets and silently mangle others, which is worse than saying no.
 *
 * So the merchant's code runs in a WebView, in its own origin, with no access
 * to the app except the small API this module injects.
 *
 * ## The three things that make it usable rather than a picture
 *
 * 1. **Height.** A WebView has no intrinsic size. Without the content
 *    measuring itself and posting the number back, every custom widget is
 *    either clipped to a guess or leaves a gap under it.
 * 2. **An API.** A merchant's widget that cannot track a click or add to the
 *    basket is a static image. `window.selwise` gives it the same four verbs
 *    it has on the web. `track` names are forwarded as the canonical
 *    `custom_event` with the merchant's name in metadata — the pipeline drops
 *    any name outside CANONICAL_EVENTS with no error, so sending theirs
 *    verbatim would look like it worked and report nothing.
 * 3. **Links leave the WebView.** A `<a href="/list/">` inside the widget must
 *    open the app's own list screen. Left alone, it navigates INSIDE the
 *    50-pixel-tall WebView, which looks like the widget broke.
 */

/** Message types the native side accepts. Anything else is ignored. */
const MESSAGE_TYPES = ['height', 'track', 'addToCart', 'close', 'navigate'];

/**
 * Reads the merchant's code out of `contentJson`.
 *
 * The alias lists mirror `apps/client/src/modules/renderer/widgets/custom.ts`
 * exactly: the dashboard has written this content under several shapes over
 * time (`html`, `customCode.html`, `customJs`, `customCode.js`, …) and a
 * widget authored under an older one must not come out blank in the app while
 * it still renders on the web.
 */
function firstString() {
  for (const value of arguments) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTiming(value) {
  if (value === 'domReady' || value === 'dom_ready') return 'domReady';
  if (value === 'customEvent' || value === 'custom_event') return 'customEvent';
  return 'immediate';
}

function resolveCustomCode(contentJson, entity) {
  const content = isRecord(contentJson) ? contentJson : {};
  const custom = isRecord(content.customCode) ? content.customCode : {};
  // The dashboard's own "Custom CSS" / "Custom JS" inputs are COLUMNS on the
  // entity, not part of contentJson — and they are where a merchant's code
  // usually lands. Read first, exactly as the browser widget orders them; a
  // widget written there used to render as an empty box in the app.
  const own = isRecord(entity) ? entity : {};

  return {
    html: firstString(content.html, custom.html),
    css: firstString(
      own.customCss,
      own.customCSS,
      content.css,
      custom.css,
      custom.customCss,
      custom.customCSS
    ),
    javascript: firstString(
      own.customJs,
      own.customJS,
      content.javascript,
      content.customJs,
      content.customJS,
      custom.javascript,
      custom.customJs,
      custom.customJS,
      custom.js
    ),
    timing: normalizeTiming(
      firstString(content.jsTiming, content.executionTiming, custom.jsTiming, custom.executionTiming)
    ),
    eventName: firstString(content.jsEventName, content.eventName, custom.jsEventName, custom.eventName),
  };
}

/**
 * The runtime injected above the merchant's code.
 *
 * `selwise.addToCart` deliberately does NOT try to reach the storefront from
 * inside the WebView: it has no session there. It posts to the native side,
 * which uses the app's own basket — the same code path the app's own buttons
 * use, so the item lands in the basket the visitor can see.
 */
function bridgeScript(surfaceId) {
  return [
    '(function(){',
    '  var post = function(type, payload){',
    '    try {',
    '      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(',
    '        JSON.stringify({ __selwise: 1, surfaceId: ' + JSON.stringify(surfaceId) + ', type: type, payload: payload || {} })',
    '      );',
    '    } catch (e) {}',
    '  };',
    '  window.selwise = {',
    '    track: function(name, metadata){ post("track", { name: name, metadata: metadata }); },',
    '    addToCart: function(code, quantity){ post("addToCart", { code: code, quantity: quantity }); },',
    '    close: function(){ post("close", {}); },',
    '    navigate: function(url){ post("navigate", { url: url }); }',
    '  };',
    // Measure on every layout change, not just once: a widget that loads an
    // image or opens an accordion changes height after first paint, and a
    // one-shot measurement leaves it clipped for the rest of the session.
    '  var last = 0;',
    '  var report = function(){',
    '    var el = document.getElementById("selwise-root");',
    '    var h = el ? Math.ceil(el.getBoundingClientRect().height) : 0;',
    '    if (h > 0 && Math.abs(h - last) > 1) { last = h; post("height", { height: h }); }',
    '  };',
    '  window.addEventListener("load", report);',
    '  document.addEventListener("DOMContentLoaded", report);',
    '  if (typeof ResizeObserver === "function") {',
    '    try { new ResizeObserver(report).observe(document.getElementById("selwise-root") || document.body); } catch (e) {}',
    '  }',
    '  setTimeout(report, 60); setTimeout(report, 400); setTimeout(report, 1200);',
    '})();',
  ].join('\n');
}

/** Wraps the merchant's JS in the timing they chose. */
function timedScript(code, timing, eventName) {
  if (!code) return '';

  if (timing === 'domReady') {
    return [
      'if (document.readyState === "loading") {',
      '  document.addEventListener("DOMContentLoaded", function(){ ' + code + ' });',
      '} else { ' + code + ' }',
    ].join('\n');
  }

  if (timing === 'customEvent' && eventName) {
    return (
      'window.addEventListener(' + JSON.stringify(eventName) + ', function(){ ' + code + ' });'
    );
  }

  return code;
}

/**
 * The full document.
 *
 * The body is transparent and has no margin so the widget sits flush in the
 * native layout — a WebView paints its own white ground otherwise, and the
 * merchant's floating pill would arrive as a white block.
 */
function buildDocument(surface) {
  const code = resolveCustomCode(surface && surface.content, surface);
  if (!code.html) return null;

  const styles = (surface && surface.styles) || {};
  const background =
    typeof styles.containerBackground === 'string' && styles.containerBackground.trim()
      ? styles.containerBackground.trim()
      : 'transparent';
  const padding =
    typeof styles.containerPadding === 'string' && styles.containerPadding.trim()
      ? styles.containerPadding.trim()
      : '0px';

  const html = [
    '<!doctype html><html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
    '<style>',
    'html,body{margin:0;padding:0;background:transparent;-webkit-text-size-adjust:100%;}',
    '#selwise-root{padding:' + padding + ';background:' + background + ';}',
    '</style>',
    code.css ? '<style>' + code.css + '</style>' : '',
    '</head><body>',
    '<div id="selwise-root">' + code.html + '</div>',
    '<script>' + bridgeScript(surface.id) + '</script>',
    code.javascript ? '<script>' + timedScript(code.javascript, code.timing, code.eventName) + '</script>' : '',
    '</body></html>',
  ].join('');

  return { html: html, hasScript: !!code.javascript, timing: code.timing };
}

/**
 * Parses a message from the WebView.
 *
 * Untrusted input from a page the merchant authored, so every field is checked
 * and anything unrecognised returns null rather than being forwarded.
 */
function parseMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 20000) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return null;
  }

  if (!isRecord(parsed) || parsed.__selwise !== 1) return null;
  if (!MESSAGE_TYPES.includes(parsed.type)) return null;

  const payload = isRecord(parsed.payload) ? parsed.payload : {};

  if (parsed.type === 'height') {
    const height = Number(payload.height);
    // A widget cannot be taller than a couple of screens; a bad number would
    // push the whole layout off.
    if (!Number.isFinite(height) || height <= 0 || height > 4000) return null;
    return { type: 'height', height: Math.ceil(height) };
  }

  if (parsed.type === 'track') {
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name || name.length > 64) return null;
    return { type: 'track', name: name, metadata: isRecord(payload.metadata) ? payload.metadata : undefined };
  }

  if (parsed.type === 'addToCart') {
    const code = typeof payload.code === 'string' ? payload.code.trim() : '';
    if (!code || code.length > 100) return null;
    const quantity = Number(payload.quantity);
    return {
      type: 'addToCart',
      code: code,
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
    };
  }

  if (parsed.type === 'navigate') {
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!url || url.length > 2000) return null;
    return { type: 'navigate', url: url };
  }

  return { type: 'close' };
}

module.exports = {
  MESSAGE_TYPES,
  resolveCustomCode,
  buildDocument,
  parseMessage,
  bridgeScript,
  timedScript,
};
