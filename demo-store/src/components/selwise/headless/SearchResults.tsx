'use client';

import { useEffect, useRef } from 'react';
import { consentedVisitor, postJson, publicSiteUrl, withSelwise } from '@/lib/selwise/client';
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
  const visitor = consentedVisitor('analytics');
  if (!visitor) return null;
  const { visitorId, sessionId, siteUserId } = visitor;
  return { visitorId, sessionId, siteUserId, pageUrl: window.location.href };
}

export function SearchResults({ apiUrl, siteKey, query, hits, total }: Props) {
  const base = `${publicSiteUrl(apiUrl, siteKey)}/search`;
  const logged = useRef('');

  useEffect(() => {
    if (!query || logged.current === query) return undefined;
    return withSelwise(() => {
      const ctx = analyticsContext();
      if (!ctx || logged.current === query) return;
      logged.current = query;
      const eventId = `headless-search:${ctx.sessionId}:${query}`;
      void postJson(`${base}/log`, { ...ctx, eventId, query, resultsCount: total });
      if (total === 0) void postJson(`${base}/zero-results`, { ...ctx, eventId: `${eventId}:zero`, query });
    });
  }, [base, query, total]);

  const click = (itemCode: string) => {
    const ctx = analyticsContext();
    if (ctx) void postJson(`${base}/click`, { ...ctx, query, productItemCode: itemCode }, true);
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
