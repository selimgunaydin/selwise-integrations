import { selwiseConfig } from './config';

export interface BusinessEventInput {
  key: string;
  siteUserId?: string;
  visitorId?: string;
  payload?: Record<string, unknown>;
  testMode?: boolean;
}

export interface BusinessEventResult {
  /** HTTP status Selwise answered with, or 0 when it could not be reached. */
  status: number;
  body: string;
  /** Selwise took the event (it found somebody to admit). */
  accepted: boolean;
  /** How many scenarios start from this key; 0 means nothing is listening for it. */
  scenarios: number;
}

/**
 * A business event, the way a merchant's own back office reports one:
 * server to server, with the channel's API key. Used by the test panel's
 * "send an event" form and by an order changing status.
 */
export async function sendBusinessEvent(input: BusinessEventInput): Promise<BusinessEventResult> {
  const cfg = selwiseConfig();
  const apiKey = process.env.SELWISE_SERVER_API_KEY;
  if (!cfg.siteKey || !apiKey) {
    return { status: 0, body: 'SELWISE_SITE_KEY ve SELWISE_SERVER_API_KEY tanımlı değil.', accepted: false, scenarios: 0 };
  }
  try {
    const res = await fetch(`${cfg.apiUrl}/public/sites/${cfg.siteKey}/business-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-selwise-api-key': apiKey },
      body: JSON.stringify(input),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.text()).slice(0, 2000);
    let parsed: { accepted?: boolean; scenarios?: number } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      /* an error page, not our JSON */
    }
    return { status: res.status, body, accepted: res.ok && parsed.accepted === true, scenarios: parsed.scenarios ?? 0 };
  } catch (e) {
    return { status: 0, body: `Selwise'a ulaşılamadı: ${(e as Error).message}`, accepted: false, scenarios: 0 };
  }
}

/**
 * The Selwise status of a store status — what a merchant's order system would
 * report to `POST /orders/:orderId/status`. A return REQUEST changes nothing
 * about the money yet, so it is not reported; the return itself is.
 */
export const SELWISE_ORDER_STATUS: Partial<Record<string, string>> = {
  awaiting_payment: 'pending',
  received: 'completed',
  preparing: 'processing',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  returned: 'returned',
};

/**
 * An order's life after it was placed, reported the way an order system
 * does: server to server, with the channel's `orders_write` key
 * (SELWISE_ORDERS_API_KEY). Without it, a cancelled order stays revenue in
 * Selwise for ever — measured on production 2026-11-05, 0 of ~940
 * orders on two channels ever received a status. Best effort: the store's own
 * status change never depends on Selwise answering.
 */
export async function sendOrderStatus(orderNumber: string, storeStatus: string): Promise<{ status: number; body: string }> {
  const cfg = selwiseConfig();
  const apiKey = process.env.SELWISE_ORDERS_API_KEY;
  const status = SELWISE_ORDER_STATUS[storeStatus];
  if (!status) return { status: 0, body: `"${storeStatus}" Selwise'a bildirilmez.` };
  if (!cfg.siteKey || !apiKey) return { status: 0, body: 'SELWISE_SITE_KEY ve SELWISE_ORDERS_API_KEY tanımlı değil.' };
  try {
    const res = await fetch(`${cfg.apiUrl}/public/sites/${cfg.siteKey}/orders/${encodeURIComponent(orderNumber)}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-selwise-api-key': apiKey },
      body: JSON.stringify({ status }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    return { status: res.status, body: (await res.text()).slice(0, 300) };
  } catch (e) {
    return { status: 0, body: `Selwise'a ulaşılamadı: ${(e as Error).message}` };
  }
}
