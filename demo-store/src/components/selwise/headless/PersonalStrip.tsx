'use client';

import { useEffect, useRef, useState } from 'react';
import { consentedVisitor, postJson, publicSiteUrl, withSelwise } from '@/lib/selwise/client';
import { HeadlessCard, type HeadlessProduct } from './HeadlessCard';

/**
 * A recommendation strip fetched IN THE BROWSER and drawn with the store's own
 * card — the measured, personal headless path.
 *
 *  1. `POST /recommendations/:widgetId/products` from the shopper's device.
 *     The request is authenticated by the verified storefront Origin, so no
 *     key is shipped to the browser. It carries the visitor only with
 *     `marketing` consent (a personal pick reads the visitor's history);
 *     without it the strip is still drawn, anonymously, like the widget does.
 *  2. `track/event` impression when the strip is drawn, click on the card.
 *     Without the click the strip earns no attribution; both are `marketing`
 *     events, so neither is sent without that consent.
 *
 * The widget does all of this by itself for the strips the panel places in
 * [data-selwise-slot] anchors. This is for a store that wants Selwise's
 * products in ITS OWN markup.
 */

interface Props {
  apiUrl: string;
  siteKey: string;
  widgetId: string;
  title: string;
  lang?: string;
}

type Status = 'loading' | 'ready' | 'empty' | 'error';

export function PersonalStrip({ apiUrl, siteKey, widgetId, title, lang }: Props) {
  const [products, setProducts] = useState<HeadlessProduct[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [note, setNote] = useState('');
  const impressionSent = useRef(false);
  const base = publicSiteUrl(apiUrl, siteKey);

  useEffect(() => {
    const controller = new AbortController();
    const stop = withSelwise(() => {
      const visitor = consentedVisitor('marketing');
      setNote(visitor ? 'Ziyaretçiye özel (pazarlama izni var).' : 'Anonim: pazarlama izni yok, ziyaretçi gönderilmedi ve ölçülmüyor.');
      fetch(`${base}/recommendations/${encodeURIComponent(widgetId)}/products${lang ? `?lang=${lang}` : ''}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(visitor ? { visitorId: visitor.visitorId, sessionId: visitor.sessionId, userId: visitor.siteUserId } : {}),
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((body: { products?: HeadlessProduct[]; error?: string }) => {
          // An inactive or foreign strip answers 201 with `error` and no products.
          if (body.error) {
            setStatus('error');
            setNote(body.error);
            return;
          }
          const list = body.products ?? [];
          setProducts(list);
          setStatus(list.length ? 'ready' : 'empty');
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') {
            setStatus('error');
            setNote(e.message);
          }
        });
    });
    return () => {
      stop();
      controller.abort();
    };
  }, [base, widgetId, lang]);

  const track = (eventType: 'impression' | 'click', productItemCode?: string, position?: number) => {
    const visitor = consentedVisitor('marketing');
    if (!visitor) return;
    void postJson(
      `${base}/recommendations/track/event`,
      {
        widgetId,
        eventType,
        productItemCode,
        visitorId: visitor.visitorId,
        sessionId: visitor.sessionId,
        journeyId: visitor.journeyId,
        userId: visitor.siteUserId,
        pageUrl: window.location.href,
        metadata: position != null ? { position, source: 'headless' } : { source: 'headless' },
      },
      eventType === 'click', // the click navigates away
    );
  };

  useEffect(() => {
    if (status === 'ready' && !impressionSent.current) {
      impressionSent.current = true;
      track('impression');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">{title}</h3>
        <p className="text-xs text-ink-muted">{note}</p>
      </div>
      {status === 'loading' && <p className="mt-3 text-sm text-ink-muted">Ürünler isteniyor…</p>}
      {status === 'empty' && <p className="mt-3 text-sm text-ink-muted">Strateji bu ziyaretçi için ürün bulamadı.</p>}
      {status === 'error' && <p className="mt-3 text-sm text-sale">İstek başarısız: {note}</p>}
      {status === 'ready' && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {products.slice(0, 6).map((p, i) => (
            <HeadlessCard key={p.itemCode} product={p} onClick={() => track('click', p.itemCode, i)} />
          ))}
        </div>
      )}
    </div>
  );
}
