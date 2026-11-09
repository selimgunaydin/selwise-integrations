import crypto from 'node:crypto';

/**
 * Signed identity: the server proves the customer id the page hands Selwise.
 *
 * Without it the id in `identify` is taken on the browser's word, and anyone
 * who knows a customer number can act as that customer. With the channel's
 * identity secret (Channels → the channel → Signed identity) the SERVER signs
 * `<customerId>:<unixSeconds>` with HMAC-SHA256 and writes the signature into
 * the page; Selwise checks it. A timestamped signature is accepted for 7 days,
 * so a leaked one expires on its own.
 *
 * The secret never leaves this file's process: it is read here, on the server,
 * and only the hex digest and the timestamp go to the browser. A signature
 * computed in the browser would prove nothing — it would mean the secret is
 * in the browser.
 *
 * Unset `SELWISE_IDENTITY_SECRET` → no signature; the store keeps working and
 * the channel counts the identify as "Unsigned" (Report mode).
 */
export interface IdentitySignature {
  userHash: string;
  userHashTs: number;
}

export function signSelwiseIdentity(customerId: string, now = Date.now()): IdentitySignature | null {
  const secret = process.env.SELWISE_IDENTITY_SECRET;
  if (!secret || !customerId) return null;
  const userHashTs = Math.floor(now / 1000);
  const userHash = crypto.createHmac('sha256', secret).update(`${customerId}:${userHashTs}`).digest('hex');
  return { userHash, userHashTs };
}

/**
 * The customer id Selwise knows a shopper by — what `identify`, an order's
 * `siteUserId` and the history import's `customerId` all carry. One
 * definition, so the imported history and the live visitor are one person.
 */
export const selwiseUserId = (u: { id: number }) => `ardisa-${u.id}`;
