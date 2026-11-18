// GENERATED FILE — DO NOT EDIT.
//
// Vendored from packages/search-contract/src/bounds.ts by
// scripts/sync-vendored-page-targeting.js. Edit the source, then run:
//
//   node scripts/sync-vendored-page-targeting.js
//
// It is copied rather than imported because @selwise/search-contract is private
// and this SDK is published: a dependency on it would not resolve for anyone
// who installs @selwise/react-native from npm.

/**
 * What the search screens' numbers and texts may hold — stated ONCE.
 *
 * Every one of these lived in two or three places: as a literal on
 * `UpdateSearchConfigDto` / the controller's DTOs, as a copy in the dashboard's
 * `search-form-checks.ts` / `rule-checks.ts`, and as the `toBoundedInt`
 * fallbacks in `useSearchForm`. Several had NO bound on the API at all, so a
 * value over the column width (a 21-character hotkey, a 101-character boost
 * rule name, an edited redirect pattern over 255) passed validation, reached
 * Postgres and came back as a 500 — "something went wrong on our side" for a
 * sentence the merchant typed. The DTOs decorate from this file and the
 * dashboard pre-checks from it. The settings document's own bounds are
 * `SEARCH_SETTINGS_BOUNDS` / `SEARCH_SETTINGS_TEXT_LIMITS` (`settings.ts`).
 */

/**
 * How many manual popular searches / products one configuration lists. The
 * service used to keep the first 100 and drop the rest without a word; the DTO
 * now refuses more, naming the count.
 */
export const SEARCH_POPULAR_MANUAL_MAX_ITEMS = 100;

/**
 * How many terms a merchant may keep off the automatic "popular searches"
 * (`suggestions.popularSearches.blocked`): test queries, a name someone typed,
 * a competitor, a word the brand does not want on its storefront.
 */
export const SEARCH_POPULAR_BLOCKED_MAX_ITEMS = 200;

/**
 * The fewest DIFFERENT sessions that must have searched a term, in the last 30
 * days, before it is offered to every visitor as a "popular search". One person
 * typing a name, a phone number or a test word is not popular; with fewer
 * distinct sessions the list simply stays shorter (or empty) instead.
 */
export const SEARCH_POPULAR_MIN_SESSIONS = 3;

/** `search_synonyms.source_term` is VarChar(100). */
export const SEARCH_SYNONYM_SOURCE_TERM_MAX_LENGTH = 100;

/** `search_redirects.query_pattern` is VarChar(255). */
export const SEARCH_REDIRECT_QUERY_PATTERN_MAX_LENGTH = 255;

/** `search_boost_rules.name` is VarChar(100). */
export const SEARCH_BOOST_RULE_NAME_MAX_LENGTH = 100;

/** `search_boost_rules.query_pattern` is VarChar(255). */
export const SEARCH_BOOST_RULE_PATTERN_MAX_LENGTH = 255;

/** `search_boost_rules.priority` is a 32-bit Int; higher runs first. */
export const SEARCH_BOOST_RULE_PRIORITY_BOUNDS = { min: -2147483648, max: 2147483647 } as const;

/** The test query of a ranking-rule rehearsal (`PreviewBoostRuleDto.query`). */
export const SEARCH_BOOST_PREVIEW_QUERY_MAX_LENGTH = 200;

/** A pinned product's place in the results: 1 is the first. */
export const SEARCH_PIN_POSITION_MIN = 1;

/**
 * Why `pattern` is not a regular expression the engine accepts, or `null` when
 * it is. The reason is the engine's own ("Unterminated character class"),
 * without the "Invalid regular expression: /…/i:" preamble that repeats the
 * pattern, so a refusal can name the pattern once and the cause once.
 *
 * Compiled exactly as the matchers do (`new RegExp(pattern, 'i')`).
 */
export function regexPatternProblem(pattern: string): string | null {
  try {
    new RegExp(pattern, 'i');
    return null;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // V8: "Invalid regular expression: /[a-/i: Unterminated character class"
    const stripped = raw.replace(/^Invalid regular expression:\s*\/.*\/[a-z]*:\s*/s, '').trim();
    return stripped || raw || 'invalid regular expression';
  }
}

/**
 * Where a search redirect may send the shopper: an absolute http(s) URL, or a
 * path on the store itself ("/sale"). Applied to the value as sent — the
 * service does not trim, so a leading space is refused.
 */
export function isAcceptableRedirectUrl(url: string): boolean {
  // A path on the store — but not `//host/...` or `/\\host`, which a browser
  // reads as ANOTHER host ("protocol-relative"): that slipped through as a
  // "path" and was the one shape that sent shoppers off-site while the
  // screen promised a page of the store.
  if (url.startsWith('/')) return !url.startsWith('//') && !url.startsWith('/\\');
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
