// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/widget-contract/src/theme-css.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/widget-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * The brand theme as a `:root` rule — the one function every frame that is not
 * the storefront page writes its tokens with.
 *
 * ## Why it is here and not in the dashboard
 *
 * A custom property set on an element is inherited by its descendants and by
 * nothing else, so a document of its own (an iframe's `srcdoc`, an app's
 * WebView) needs the tokens written into the document itself. The dashboard's
 * enrichment and custom-widget previews did, through a private helper; the app
 * draws a product enrichment block in a WebView and needs exactly the same
 * rule. Two writers of one rule is how a block previewed one brand in the
 * dashboard and shipped another to a phone, so there is one, and both import it.
 *
 * Pure: no DOM, no imports. The SDK vendors this file
 * (`scripts/sync-vendored-page-targeting.js`).
 *
 * NOT re-exported from the barrel: import the subpath,
 *   import { brandTokenCss } from '@selwise/widget-contract/theme-css'
 */

/**
 * Values are refused rather than escaped. They arrive from `deriveThemeTokens`
 * and are already well-formed; anything carrying CSS punctuation is a bug
 * upstream, and dropping it keeps a malformed token from closing the block.
 */
const UNSAFE_TOKEN_VALUE = /[<>{};]|\/\*/;

/**
 * The tokens as `:root { --selwise-brand: …; }`, or `''` when there are none.
 *
 * A name is read with or without its `--` (the dashboard stores
 * `selwise-brand`, the app's client keeps `--selwise-brand`); only a
 * `selwise-` name is a token, so a stray key never becomes a custom property.
 */
export function brandTokenCss(tokens: Readonly<Record<string, string>> | null | undefined): string {
  if (!tokens) return '';

  const declarations: string[] = [];
  for (const [rawName, value] of Object.entries(tokens)) {
    const name = rawName.replace(/^--/, '');
    if (!name.startsWith('selwise-') || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed === '' || UNSAFE_TOKEN_VALUE.test(trimmed)) continue;
    declarations.push(`--${name}: ${trimmed};`);
  }

  return declarations.length ? `:root { ${declarations.join(' ')} }` : '';
}
