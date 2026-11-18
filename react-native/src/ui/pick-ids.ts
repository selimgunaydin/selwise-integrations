/**
 * The names a drawn part carries so a UI test — or the dashboard's preview — can
 * say WHICH part was touched.
 *
 * Each part of a surface the merchant edits (a campaign's title, its button, its
 * picture; a strip's heading; a card's element) is drawn with a `testID`. React
 * Native ignores it in production; react-native-web writes it as
 * `data-testid`, which is how the builder's preview turns a click on the
 * rendering into "open the field that draws this" (the same question the web
 * preview answers with `data-selwise-field`). Merchants' own UI tests can use
 * them too.
 *
 * `selwise-pick:<part>[:<field>]` — the part is one of the dashboard's words for
 * it (`title`, `text`, `button`, `image`, `close`, `container`, `card`, `arrows`,
 * `dots`) and the field, when there is one, the content field that holds its
 * words (`buttonText`, `imageUrl`). `selwise-node:<id>` is an element of a
 * designed product card, by the id the designer gave it.
 *
 * Plain TypeScript, so it is tested without React Native.
 */

export type PickPart = 'title' | 'text' | 'button' | 'image' | 'card' | 'arrows' | 'dots' | 'close' | 'container';

export const PICK_PREFIX = 'selwise-pick';
export const NODE_PREFIX = 'selwise-node';
/** The whole of one drawn product card, by the product's code. */
export const CARD_PREFIX = 'selwise-card';

const PARTS: readonly string[] = ['title', 'text', 'button', 'image', 'card', 'arrows', 'dots', 'close', 'container'];

/** The `testID` of a part. */
export function pickId(part: PickPart, field?: string): string {
  return field ? `${PICK_PREFIX}:${part}:${field}` : `${PICK_PREFIX}:${part}`;
}

/** The `testID` of an element of a designed product card. */
export function nodePickId(nodeId: string): string {
  return `${NODE_PREFIX}:${nodeId}`;
}

/**
 * The `testID` of one drawn product card. A card is a drawn instance, not an
 * element the designer owns, so it is not a pick: it tells the dashboard's canvas
 * WHICH card on screen a click or an outline belongs to when it draws two.
 */
export function cardPickId(itemCode: string): string {
  return `${CARD_PREFIX}-${itemCode}`;
}

export interface Pick {
  part: PickPart;
  field?: string;
  /** The designer's id of the card element, when the part is one. */
  node?: string;
}

/** What a `testID` names, or null when it is none of ours. */
export function readPickId(testId: unknown): Pick | null {
  if (typeof testId !== 'string') return null;
  if (testId.startsWith(`${NODE_PREFIX}:`)) {
    const node = testId.slice(NODE_PREFIX.length + 1);
    return node ? { part: 'card', node } : null;
  }
  if (!testId.startsWith(`${PICK_PREFIX}:`)) return null;
  const [part, ...rest] = testId.slice(PICK_PREFIX.length + 1).split(':');
  if (!part || !PARTS.includes(part)) return null;
  const field = rest.join(':');
  return { part: part as PickPart, ...(field ? { field } : {}) };
}
