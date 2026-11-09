'use client';

import { useCallback, useEffect, useState } from 'react';
import { selwiseInstance, withSelwise } from '@/lib/selwise/client';
import { Field } from './DevBits';

interface Snapshot {
  visitorId: string | null;
  sessionId: string | null;
  siteUserId: string | null;
  journey: string;
  cart: string;
  consent: string;
  layer: Record<string, unknown>[];
}

function read(): Snapshot | null {
  const s = selwiseInstance();
  if (!s) return null;
  const journey = s.getJourneyState?.();
  const cart = s.getCart?.();
  const consent = s.getConsentState?.();
  return {
    visitorId: s.getVisitorId?.() ?? null,
    sessionId: s.getSessionId?.() ?? null,
    siteUserId: s.getSiteUserId?.() ?? null,
    journey: journey ? `${journey.journeyId ?? '—'} · ${journey.isValid ? 'geçerli' : 'bitmiş'}` : '—',
    cart: cart ? (cart.known ? `${cart.itemCount} adet · ${cart.total} ${cart.currency ?? ''}` : 'ölçülmedi (known: false)') : '—',
    consent:
      consent === undefined
        ? '—'
        : consent === null
          ? 'henüz cevap yok (null)'
          : Object.entries(consent)
              .map(([k, v]) => `${k}: ${v ? 'evet' : 'hayır'}`)
              .join(' · '),
    layer: (s.getDataLayer?.() ?? []).slice(-8).reverse(),
  };
}

/**
 * What the widget knows on THIS page, read through the public JavaScript API —
 * the same calls a merchant's developer types into the console.
 */
export function SelwiseInspector() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const refresh = useCallback(() => setSnap(read()), []);

  useEffect(() => {
    const stop = withSelwise(() => refresh());
    const t = window.setTimeout(() => setMissing(!selwiseInstance()), 10500);
    const onCart = () => refresh();
    document.addEventListener('selwise:cart', onCart);
    return () => {
      stop();
      window.clearTimeout(t);
      document.removeEventListener('selwise:cart', onCart);
    };
  }, [refresh]);

  if (!snap) {
    return (
      <p className="text-sm text-ink-muted">
        {missing ? 'Selwise bu sayfada yüklenmedi (site anahtarı yok ya da bir reklam engelleyici client.js’i durdurdu). Mağaza yine çalışır.' : 'Selwise bekleniyor…'}
      </p>
    );
  }

  return (
    <div>
      <dl>
        <Field label="Ziyaretçi" value={snap.visitorId} />
        <Field label="Oturum" value={snap.sessionId} />
        <Field label="Müşteri (identify)" value={snap.siteUserId ?? 'giriş yapılmadı'} />
        <Field label="Yolculuk" value={snap.journey} />
        <Field label="Sepet (getCart)" value={snap.cart} />
        <Field label="Onay (getConsentState)" value={snap.consent} />
      </dl>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-label text-ink-muted">Veri katmanı — son kayıtlar (getDataLayer)</p>
        <button type="button" className="btn-ghost btn-sm" onClick={refresh}>
          Yenile
        </button>
      </div>
      {snap.layer.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Bu sayfada henüz veri katmanı kaydı yok. Bir ürünü sepete ekleyip buraya dönün.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {snap.layer.map((entry, i) => (
            <li key={i}>
              <pre className="max-h-40 overflow-auto rounded-lg bg-sand p-3 text-2xs leading-relaxed text-ink">{JSON.stringify(entry, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
