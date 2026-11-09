'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { clearPending, readPending } from '@/lib/checkout/draft';
import { formatPrice } from '@/lib/format';

interface Pending {
  amount: number;
  card: { last4: string; brand: string };
  [k: string]: unknown;
}

/** A stand-in for the issuing bank's 3-D Secure page. Nothing leaves the store. */
export default function ThreeDSecurePage() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(180);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = readPending<Pending>();
    if (!p) window.location.replace('/checkout/payment');
    else setPending(p);
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!pending) return null;
  const cancel = (msg: string) => {
    clearPending();
    window.location.href = `/checkout/payment?error=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-white p-8" id="three-d-secure">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-ok" /> 3D Secure Doğrulama</p>
        <span className="rounded bg-sand px-2 py-1 text-2xs font-semibold">{pending.card.brand}</span>
      </div>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-muted">İşyeri</dt><dd>ARDISA MAGAZACILIK</dd>
        <dt className="text-ink-muted">Tutar</dt><dd className="font-semibold">{formatPrice(pending.amount)}</dd>
        <dt className="text-ink-muted">Kart</dt><dd>**** **** **** {pending.card.last4}</dd>
      </dl>
      <p className="mt-6 text-sm text-ink-soft">Cep telefonunuza gönderilen tek kullanımlık şifreyi girin.</p>
      <p className="mt-1 rounded-lg bg-sand px-3 py-2 text-xs">Demo: doğrulama kodu <strong>123456</strong></p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await fetch('/api/checkout/place', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...pending, threeDsCode: code }),
          });
          const data = await res.json();
          if (!res.ok) {
            setBusy(false);
            if (res.status === 402) return setError(data.error);
            return cancel(data.error);
          }
          clearPending();
          window.location.href = `/checkout/success/${data.token}`;
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="input text-center text-lg tracking-[0.5em]" placeholder="••••••" id="otp-input" autoFocus />
        {error && <p className="text-sm text-sale">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || code.length !== 6 || left === 0} id="otp-submit">Onayla</button>
        <button type="button" className="btn-ghost w-full" onClick={() => cancel('Ödeme doğrulaması iptal edildi.')}>İptal</button>
        <p className="text-center text-2xs text-ink-muted">Kalan süre: {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
      </form>
    </div>
  );
}
