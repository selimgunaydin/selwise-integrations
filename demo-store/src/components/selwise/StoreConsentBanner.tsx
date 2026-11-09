'use client';

import { useCallback, useEffect, useState } from 'react';
import { grantConsent, OPEN_STORE_CONSENT_EVENT, revokeConsent, withSelwise, type ConsentState } from '@/lib/selwise/client';

/**
 * The store's OWN cookie banner — the shape of a merchant that already has a
 * consent solution (its own banner, OneTrust, Cookiebot…) and must not show
 * the Selwise one beside it.
 *
 * Panel side (Audience → Cookie Consent): "Show the Selwise consent banner"
 * OFF, "Require consent before tracking" and "Hold events until the answer"
 * ON. Selwise then holds every event until this component hands over the
 * decision with `grantConsent` / `revokeConsent` (both queued, so a click
 * before client.js arrives is not lost).
 *
 * A CMP that speaks IAB TCF v2 (`__tcfapi`) or Google Consent Mode v2
 * (`gtag('consent', …)`) needs none of this — Selwise reads those signals by
 * itself. This is the path for everything else.
 *
 * Rendered only when SELWISE_CONSENT_UI=store (app/layout.tsx).
 */

const STORAGE_KEY = 'ardisa_cookie_choice';

type Choice = Pick<ConsentState, 'analytics' | 'marketing' | 'preferences'> & { at: string };

function readChoice(): Choice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Choice) : null;
  } catch {
    return null;
  }
}

/** Hand the store's decision to Selwise. Every category is named: a partial object leaves the unnamed ones granted. */
function applyToSelwise(choice: Pick<ConsentState, 'analytics' | 'marketing' | 'preferences'>) {
  if (!choice.analytics && !choice.marketing && !choice.preferences) {
    revokeConsent();
    return;
  }
  grantConsent({ analytics: choice.analytics, marketing: choice.marketing, preferences: choice.preferences });
}

export function StoreConsentBanner() {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState({ analytics: true, marketing: false, preferences: true });

  useEffect(() => {
    const saved = readChoice();
    if (!saved) {
      setOpen(true);
    } else {
      setDraft({ analytics: saved.analytics, marketing: saved.marketing, preferences: saved.preferences });
      // The store's record is the source of truth. If Selwise lost its own copy
      // (storage cleared, a new subdomain), hand the same answer over once —
      // never on every page, which would write a consent record per view.
      return withSelwise((s) => {
        if (s.getConsentState && s.getConsentState() === null) applyToSelwise(saved);
      });
    }
    return undefined;
  }, []);

  useEffect(() => {
    const reopen = () => {
      setCustom(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_STORE_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_STORE_CONSENT_EVENT, reopen);
  }, []);

  const decide = useCallback((choice: Pick<ConsentState, 'analytics' | 'marketing' | 'preferences'>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...choice, at: new Date().toISOString() }));
    } catch {
      // error-surface: private mode — the decision still reaches Selwise for this page
    }
    applyToSelwise(choice);
    setDraft(choice);
    setOpen(false);
    setCustom(false);
  }, []);

  if (!open) return null;

  const rows: Array<[keyof typeof draft, string, string]> = [
    ['analytics', 'Analiz', 'Hangi sayfalara baktığınız, sepet ve sipariş; mağazayı iyileştirmek için.'],
    ['marketing', 'Pazarlama', 'Size özel öneriler, kampanyalar ve A/B testleri.'],
    ['preferences', 'Tercihler', 'Dil ve görünüm gibi seçimlerinizin hatırlanması.'],
  ];

  return (
    <div role="dialog" aria-label="Çerez tercihleri" className="fixed inset-x-0 bottom-0 z-modal-top border-t border-line bg-white shadow-pop">
      <div className="container py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="font-display text-lg">Çerezler — Ardisa&apos;nın kendi bandı</p>
            <p className="mt-1 text-sm text-ink-soft">
              Bu bant mağazanın kendi onay çözümüdür; kararınızı Selwise&apos;a <code className="text-xs">grantConsent</code> /{' '}
              <code className="text-xs">revokeConsent</code> ile iletir. Zorunlu çerezler her zaman açıktır.
            </p>
          </div>
          {!custom && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" className="btn-outline btn-sm" onClick={() => decide({ analytics: false, marketing: false, preferences: false })}>
                Reddet
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setCustom(true)}>
                Özelleştir
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => decide({ analytics: true, marketing: true, preferences: true })}>
                Tümünü kabul et
              </button>
            </div>
          )}
        </div>
        {custom && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {rows.map(([key, title, text]) => (
              <label key={key} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={draft[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-ink-muted">{text}</span>
                </span>
              </label>
            ))}
            <div className="flex gap-2 md:col-span-3 md:justify-end">
              <button type="button" className="btn-outline btn-sm" onClick={() => decide({ analytics: false, marketing: false, preferences: false })}>
                Tümünü reddet
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => decide(draft)}>
                Seçimimi kaydet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
