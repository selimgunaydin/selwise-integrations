'use client';

import { useCallback, useEffect, useState } from 'react';
import { consentUi, grantConsent, openConsentPreferences, revokeConsent, selwiseInstance, withdrawConsent, withSelwise, type ConsentState } from '@/lib/selwise/client';

/**
 * The consent API, button by button. Each button is one documented call; the
 * state below is what `getConsentState()` answers right after it.
 */
export function ConsentLab() {
  const [state, setState] = useState<ConsentState | null | undefined>(undefined);
  const [last, setLast] = useState<string>('');
  const [mode, setMode] = useState<'selwise' | 'store'>('selwise');

  const read = useCallback(() => setState(selwiseInstance()?.getConsentState?.() ?? (selwiseInstance() ? null : undefined)), []);

  useEffect(() => {
    setMode(consentUi());
    return withSelwise(() => read());
  }, [read]);

  const run = (label: string, fn: () => void) => {
    fn();
    setLast(label);
    // The decision is written synchronously; give the widget a tick to persist it.
    window.setTimeout(read, 150);
  };

  const actions: Array<[string, () => void]> = [
    ['Selwise.grantConsent()', () => grantConsent()],
    ["Selwise.grantConsent({ analytics: true, marketing: false, preferences: true })", () => grantConsent({ analytics: true, marketing: false, preferences: true })],
    ["Selwise.revokeConsent(['marketing'])", () => revokeConsent(['marketing'])],
    ['Selwise.revokeConsent()', () => revokeConsent()],
    ['Selwise.withdrawConsent()', () => withdrawConsent()],
    [mode === 'store' ? 'Mağazanın bandını aç' : 'Selwise.showConsentPreferences()', () => openConsentPreferences()],
  ];

  return (
    <div className="space-y-4">
      <p>
        Bu mağazada bandı <strong>{mode === 'store' ? 'mağazanın kendisi' : 'Selwise'}</strong> çiziyor
        {mode === 'store' ? ' (SELWISE_CONSENT_UI=store).' : ' (varsayılan). Kendi bandınız varsa SELWISE_CONSENT_UI=store örneğine bakın.'}
      </p>
      <div className="grid gap-2">
        {actions.map(([label, fn]) => (
          <button key={label} type="button" className="btn-outline btn-sm justify-start font-mono text-xs" onClick={() => run(label, fn)}>
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-xl bg-sand p-4">
        <p className="text-xs uppercase tracking-label text-ink-muted">getConsentState(){last ? ` — ${last} sonrası` : ''}</p>
        <pre className="mt-2 text-xs text-ink">
          {state === undefined ? 'Selwise yüklenmedi.' : state === null ? 'null — ziyaretçi henüz cevap vermedi ("reddetti" ile aynı şey değil)' : JSON.stringify(state, null, 2)}
        </pre>
      </div>
      <p className="text-xs text-ink-muted">
        grantConsent / revokeConsent komut kuyruğuna girer: onay çözümünüz widget’tan önce çalışsa bile çağrı kaybolmaz. Karar sunucuya da yazılır
        (<code>action: api</code>) ve bekletilen olaylar serbest kalır.
      </p>
    </div>
  );
}
