'use client';

import { useEffect, useRef } from 'react';
import { selwiseInstance, withSelwise } from '@/lib/selwise/client';
import { HeadlessCard, type HeadlessProduct } from './HeadlessCard';

/**
 * Search results rendered on the server (GET /search), measured from the
 * browser. The server-side search call records nothing; the store reports
 * the query (`search/log`, or `search/zero-results` when nothing matched) and
 * every result click (`search/click`) so Search Analytics and the zero-results
 * ledger see it. All three are `analytics` events: sent only with that consent,
 * and an `eventId` makes a reload harmless.
 */
interface Props {
  apiUrl: string;
  siteKey: string;
  query: string;
  hits: HeadlessProduct[];
  total: number;
}

function analyticsContext() {
  const s = selwiseInstance();
  if (!s?.getConsentState?.()?.analytics) return null;
  return {
    visitorId: s.getVisitorId?.(),
    sessionId: s.getSessionId?.(),
    siteUserId: s.getSiteUserId?.() || undefined,
    pageUrl: window.location.href,
  };
}

export function SearchResults({ apiUrl, siteKey, query, hits, total }: Props) {
  const base = `${apiUrl}/public/sites/${encodeURIComponent(siteKey)}/search`;
  const logged = useRef('');

  useEffect(() => {
    if (!query || logged.current === query) return undefined;
    return withSelwise(() => {
      const ctx = analyticsContext();
      if (!ctx || logged.current === query) return;
      logged.current = query;
      const eventId = `headless-search:${ctx.sessionId}:${query}`;
      const post = (path: string, body: Record<string, unknown>) =>
        fetch(`${base}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
      void post('log', { ...ctx, eventId, query, resultsCount: total });
      if (total === 0) void post('zero-results', { ...ctx, eventId: `${eventId}:zero`, query });
    });
  }, [base, query, total]);

  const click = (itemCode: string) => {
    const ctx = analyticsContext();
    if (!ctx) return;
    void fetch(`${base}/click`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ ...ctx, query, productItemCode: itemCode }),
    }).catch(() => undefined);
  };

  if (hits.length === 0) return <p className="text-sm text-ink-muted">“{query}” için sonuç yok. Analiz izni varsa sorgu sıfır sonuç defterine yazılır.</p>;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {hits.map((h) => (
        <HeadlessCard key={h.itemCode} product={h} onClick={() => click(h.itemCode)} />
      ))}
    </div>
  );
}
