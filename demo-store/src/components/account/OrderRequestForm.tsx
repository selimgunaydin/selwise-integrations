'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { REQUEST_REASONS, type RequestReason } from '@/lib/account/shared';
import { formatPrice } from '@/lib/format';
import { customEvent } from '@/lib/selwise/client';

interface Line {
  code: string;
  title: string;
  size: string;
  qty: number;
  colorName: string;
  image: string;
  lineTotal: number;
}

export function OrderRequestForm({ number, kind, lines, backHref }: { number: string; kind: 'cancel' | 'return'; lines: Line[]; backHref: string }) {
  const router = useRouter();
  const isCancel = kind === 'cancel';
  // A cancellation applies to the whole order (the store cancels orders, not lines).
  const [picked, setPicked] = useState<number[]>(isCancel ? lines.map((_, i) => i) : []);
  const [reason, setReason] = useState<RequestReason | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ statusLabel: string } | null>(null);

  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const refund = picked.reduce((s, i) => s + (lines[i]?.lineTotal ?? 0), 0);

  if (done) {
    return (
      <div className="card mt-8 p-6 md:p-8" role="status">
        <CheckCircle2 size={28} strokeWidth={1.6} className="text-ok" />
        <p className="mt-4 font-display text-2xl">{isCancel ? 'Siparişiniz iptal edildi' : 'İade talebiniz alındı'}</p>
        <p className="mt-2 max-w-lg text-sm text-ink-soft">
          {isCancel
            ? 'İptal işleminiz onaylandı. Ödemeniz, kullandığınız ödeme yöntemine 3-10 iş günü içinde iade edilir.'
            : 'Talebiniz incelemeye alındı. Ürünleri 14 gün içinde anlaşmalı kargo ile ücretsiz gönderebilir ya da faturanızla herhangi bir Ardisa mağazasına teslim edebilirsiniz.'}
        </p>
        <p className="mt-4 text-xs text-ink-muted">Güncel sipariş durumu: {done.statusLabel}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={backHref} className="btn-primary btn-sm">Sipariş detayına dön</Link>
          <Link href="/account/siparislerim" className="btn-outline btn-sm">Tüm siparişlerim</Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mt-8 space-y-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (picked.length === 0) return setError('En az bir ürün seçin.');
        if (!reason) return setError('Lütfen bir neden seçin.');
        setBusy(true);
        const codes = Array.from(new Set(picked.map((i) => lines[i].code)));
        const res = await fetch('/api/account/order-request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ number, kind, codes, reason, note: note.trim() || undefined }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setBusy(false);
        if (!res || !res.ok) {
          setError(data?.error || 'Talebiniz şu anda alınamadı, lütfen tekrar deneyin.');
          return;
        }
        customEvent(isCancel ? 'order_cancel_request' : 'order_return_request', { orderId: number, reason, itemCount: codes.length, productItemCodes: codes });
        setDone({ statusLabel: data.statusLabel });
        router.refresh();
      }}
    >
      <fieldset>
        <legend className="font-display text-xl">{isCancel ? 'İptal edilecek ürünler' : 'İade etmek istediğiniz ürünler'}</legend>
        {isCancel && <p className="mt-1 text-xs text-ink-muted">Kargoya verilmemiş siparişler bütün olarak iptal edilir.</p>}
        <ul className="card mt-4 divide-y divide-line">
          {lines.map((l, i) => {
            const id = `req-line-${i}`;
            return (
              <li key={id}>
                <label htmlFor={id} className={`flex items-center gap-4 p-4 ${isCancel ? '' : 'cursor-pointer hover:bg-paper'}`}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={picked.includes(i)}
                    onChange={() => toggle(i)}
                    disabled={isCancel}
                    className="h-4 w-4 shrink-0 accent-ink"
                  />
                  <img src={l.image} alt="" className="h-20 w-16 shrink-0 rounded-lg bg-sand object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{l.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {l.colorName} · Beden: {l.size} · {l.qty} adet
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium">{formatPrice(l.lineTotal)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="req-reason">{isCancel ? 'İptal nedeni' : 'İade nedeni'}</label>
          <select id="req-reason" required value={reason} onChange={(e) => setReason(e.target.value as RequestReason)} className="input">
            <option value="" disabled>
              Seçiniz
            </option>
            {REQUEST_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-xl bg-sand p-4 text-sm">
          <p className="text-xs text-ink-muted">{isCancel ? 'İade edilecek tutar' : 'Tahmini iade tutarı'}</p>
          <p className="mt-1 font-display text-2xl">{formatPrice(refund)}</p>
          <p className="mt-1 text-2xs text-ink-muted">{picked.length} ürün seçildi. Kargo ve hizmet bedelleri hesaplamaya dahil değildir.</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="req-note">
          Notunuz <span className="text-ink-faint">(isteğe bağlı)</span>
        </label>
        <textarea
          id="req-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={4}
          className="input h-auto py-3"
          placeholder={isCancel ? 'Eklemek istediğiniz bir not varsa yazın.' : 'Ürünle ilgili sorunu kısaca anlatın.'}
        />
        <p className="mt-1 text-right text-2xs text-ink-faint">{note.length}/500</p>
      </div>

      {error && <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale" role="alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button className={isCancel ? 'btn-accent' : 'btn-primary'} disabled={busy}>
          {busy ? 'Gönderiliyor…' : isCancel ? 'Siparişi İptal Et' : 'İade Talebini Gönder'}
        </button>
        <Link href={backHref} className="btn-ghost">Vazgeç</Link>
      </div>
      <p className="text-2xs text-ink-muted">
        Ayrıntılar için <Link href="/sozlesmeler/iade-kosullari" className="link">iade ve değişim koşullarına</Link> bakabilirsiniz.
      </p>
    </form>
  );
}
