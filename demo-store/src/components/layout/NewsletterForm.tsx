'use client';

import { useState } from 'react';
import { subscribeNewsletter } from '@/lib/selwise/client';

export function NewsletterForm({ siteKey, apiUrl, source = 'footer' }: { siteKey: string; apiUrl: string; source?: string }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sms, setSms] = useState(false);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  return state === 'done' ? (
    <div className="rounded-xl border border-ok/30 bg-white p-5 text-sm">
      <p className="font-medium text-ok">Teşekkürler, aramıza hoş geldiniz!</p>
      <p className="mt-1 text-ink-soft">
        İlk siparişinizde <strong>HOSGELDIN10</strong> kodu ile %10 indirim kazanın.
      </p>
    </div>
  ) : (
    <form
      id="newsletter-form"
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!consent) return;
        setState('busy');
        try {
          if (siteKey) await subscribeNewsletter(siteKey, apiUrl, { email, phone: phone || undefined, sms, source: `${window.location.pathname}#${source}` });
          setState('done');
        } catch {
          setState('error');
        }
      }}
    >
      <div className="flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresiniz" className="input" aria-label="E-posta" />
        <button className="btn-primary shrink-0" disabled={state === 'busy' || !consent}>
          Abone Ol
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-soft">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} className="accent-ink" /> SMS ile de haber ver
        </label>
        {sms && (
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+905xxxxxxxxx" className="input h-9 w-44 text-xs" aria-label="Telefon" />
        )}
      </div>
      <label className="flex items-start gap-2 text-2xs leading-relaxed text-ink-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-ink" />
        <span>
          Kampanya ve duyurulardan haberdar olmak için ticari elektronik ileti almayı kabul ediyorum. <a href="/sozlesmeler/kvkk-aydinlatma-metni" className="link">Aydınlatma metni</a>
        </span>
      </label>
      {state === 'error' && <p className="text-xs text-sale">Abonelik şu anda kaydedilemedi, lütfen tekrar deneyin.</p>}
    </form>
  );
}
