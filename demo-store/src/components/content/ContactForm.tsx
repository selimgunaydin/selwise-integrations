'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useStore } from '../Providers';
import { CONTACT_SUBJECTS } from '@/lib/content/contact';

const ORDER_SUBJECTS = new Set(['Sipariş', 'Kargo & Teslimat', 'İade & Değişim', 'Ödeme']);

export function ContactForm() {
  const { user } = useStore();
  const [f, setF] = useState({
    name: user ? `${user.firstName} ${user.lastName}` : '',
    email: user?.email ?? '',
    subject: '',
    orderNumber: '',
    message: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const invalid = (k: keyof typeof f) => (error?.field === k ? 'border-sale' : '');

  if (reference) {
    return (
      <div role="status" className="rounded-xl bg-sand p-6">
        <CheckCircle2 size={28} strokeWidth={1.6} className="text-ok" />
        <p className="mt-4 font-display text-2xl">Mesajınız bize ulaştı</p>
        <p className="mt-2 text-sm text-ink-soft">
          Teşekkürler{f.name ? `, ${f.name.split(' ')[0]}` : ''}. Talep numaranız <strong className="text-ink">{reference}</strong>. İş günlerinde 24 saat
          içinde <strong className="text-ink">{f.email}</strong> adresine yanıt vereceğiz.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/yardim" className="btn-outline btn-sm">Sıkça Sorulan Sorular</Link>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setReference(null);
              setF((s) => ({ ...s, subject: '', orderNumber: '', message: '' }));
            }}
          >
            Yeni mesaj yaz
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      id="contact-form"
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...f, orderNumber: f.orderNumber.trim() || undefined }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setBusy(false);
        if (!res || !res.ok) {
          setError({ text: data?.error || 'Mesajınız gönderilemedi, lütfen tekrar deneyin.', field: data?.field });
          return;
        }
        setReference(data.reference);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ct-name">Ad soyad</label>
          <input id="ct-name" required minLength={2} maxLength={80} value={f.name} onChange={set('name')} className={`input ${invalid('name')}`} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="ct-email">E-posta</label>
          <input id="ct-email" type="email" required maxLength={120} value={f.email} onChange={set('email')} className={`input ${invalid('email')}`} autoComplete="email" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ct-subject">Konu</label>
          <select id="ct-subject" required value={f.subject} onChange={set('subject')} className={`input ${invalid('subject')}`}>
            <option value="" disabled>
              Seçiniz
            </option>
            {CONTACT_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ct-order">
            Sipariş numarası <span className="text-ink-faint">({ORDER_SUBJECTS.has(f.subject) ? 'varsa' : 'isteğe bağlı'})</span>
          </label>
          <input
            id="ct-order"
            value={f.orderNumber}
            onChange={set('orderNumber')}
            maxLength={40}
            placeholder="ARD…"
            className={`input uppercase placeholder:normal-case ${invalid('orderNumber')}`}
            autoComplete="off"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ct-message">Mesajınız</label>
        <textarea
          id="ct-message"
          required
          minLength={10}
          maxLength={2000}
          rows={6}
          value={f.message}
          onChange={set('message')}
          className={`input h-auto py-3 ${invalid('message')}`}
        />
        <p className="mt-1 text-right text-2xs text-ink-faint">{f.message.length}/2000</p>
      </div>
      {error && (
        <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale" role="alert">
          {error.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Gönderiliyor…' : 'Mesajı Gönder'}
        </button>
        <p className="text-2xs text-ink-muted">
          Bilgileriniz <Link href="/sozlesmeler/kvkk-aydinlatma-metni" className="link">aydınlatma metni</Link> kapsamında işlenir.
        </p>
      </div>
    </form>
  );
}
