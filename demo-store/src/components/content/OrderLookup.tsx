'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, Truck } from 'lucide-react';
import type { OrderStatus } from '@/lib/store/orders';
import { STATUS_TONE } from '@/lib/account/shared';
import { formatDate, formatPrice } from '@/lib/format';

interface LookupResult {
  number: string;
  status: OrderStatus;
  statusLabel: string;
  createdAt: string;
  total: number;
  shippingMethod: string;
  trackingNumber: string | null;
  city: string | null;
  lines: Array<{ code: string; slug: string; title: string; colorName: string; size: string; qty: number; lineTotal: number; image: string }>;
}

const FLOW: OrderStatus[] = ['received', 'preparing', 'shipped', 'delivered'];
const FLOW_LABEL: Record<string, string> = { received: 'Alındı', preparing: 'Hazırlanıyor', shipped: 'Kargoda', delivered: 'Teslim edildi' };

export function OrderLookup({ defaultEmail }: { defaultEmail: string }) {
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<LookupResult | null>(null);

  const reached = order ? (['return_requested', 'returned'].includes(order.status) ? 3 : FLOW.indexOf(order.status)) : -1;

  return (
    <div className="mt-8">
      <form
        id="order-lookup-form"
        className="card grid gap-4 p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setOrder(null);
          // POST, never a query string: an e-mail address must not end up in a URL.
          const res = await fetch('/api/order-lookup', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ number: number.trim(), email: email.trim() }),
          }).catch(() => null);
          const data = res ? await res.json().catch(() => ({})) : {};
          setBusy(false);
          if (!res || !res.ok) {
            setError(data?.error || 'Sorgulama şu anda yapılamıyor, lütfen tekrar deneyin.');
            return;
          }
          setOrder(data.order);
        }}
      >
        <div>
          <label className="label" htmlFor="lookup-number">Sipariş numarası</label>
          <input
            id="lookup-number"
            required
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="ARD…"
            className="input uppercase placeholder:normal-case"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label" htmlFor="lookup-email">E-posta adresi</label>
          <input id="lookup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
        </div>
        <button className="btn-primary" disabled={busy}>
          <Search size={16} /> {busy ? 'Sorgulanıyor…' : 'Sorgula'}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale" role="alert">
          {error}
        </p>
      )}

      {order && (
        <section className="card mt-6 overflow-hidden" aria-live="polite" aria-labelledby="lookup-result-title">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-6">
            <div>
              <p className="eyebrow">{formatDate(order.createdAt, true)}</p>
              <h2 id="lookup-result-title" className="mt-1 font-display text-2xl">Sipariş #{order.number}</h2>
              <p className="mt-1 text-xs text-ink-muted">
                {order.shippingMethod}
                {order.city ? ` · ${order.city}` : ''} · {formatPrice(order.total)}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[order.status]}`}>{order.statusLabel}</span>
          </div>

          {order.status !== 'cancelled' && order.status !== 'awaiting_payment' && (
            <ol className="grid grid-cols-4 gap-1 px-6 pt-6" aria-label="Sipariş adımları">
              {FLOW.map((s, i) => (
                <li key={s} className="text-center">
                  <span className={`block h-1 rounded-full ${i <= reached ? 'bg-ink' : 'bg-line-strong'}`} />
                  <span className={`mt-2 block text-2xs ${i <= reached ? 'font-medium text-ink' : 'text-ink-muted'}`}>{FLOW_LABEL[s]}</span>
                </li>
              ))}
            </ol>
          )}

          {order.trackingNumber && (
            <div className="mx-6 mt-6 flex items-center gap-3 rounded-xl bg-sand p-4 text-sm">
              <Truck size={18} strokeWidth={1.6} className="shrink-0 text-accent" />
              <div>
                <p className="text-2xs uppercase tracking-label text-ink-muted">Kargo takip numarası</p>
                <p className="font-medium tracking-wide">{order.trackingNumber}</p>
              </div>
            </div>
          )}

          <ul className="divide-y divide-line p-6 pt-4">
            {order.lines.map((l, i) => (
              <li key={`${l.code}-${l.size}-${i}`} className="flex items-center gap-4 py-3">
                <img src={l.image} alt="" className="h-16 w-14 shrink-0 rounded-lg bg-sand object-cover" />
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${l.slug}`} className="text-sm font-medium hover:underline">
                    {l.title}
                  </Link>
                  <p className="text-2xs text-ink-muted">
                    {l.colorName} · Beden: {l.size} · {l.qty} adet
                  </p>
                </div>
                <p className="shrink-0 text-sm">{formatPrice(l.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-paper/60 px-6 py-4 text-sm">
            <span className="text-ink-soft">Toplam</span>
            <span className="font-semibold">{formatPrice(order.total)}</span>
          </div>
        </section>
      )}

      <p className="mt-8 text-xs text-ink-muted">
        Sipariş numaranızı bulamıyor musunuz? <Link href="/iletisim" className="link">Bize yazın</Link>, yardımcı olalım.
      </p>
    </div>
  );
}
