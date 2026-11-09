'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useStore } from '../Providers';

type Field = 'current' | 'next' | 'repeat';

const LABELS: Record<Field, { label: string; autoComplete: string }> = {
  current: { label: 'Mevcut şifre', autoComplete: 'current-password' },
  next: { label: 'Yeni şifre', autoComplete: 'new-password' },
  repeat: { label: 'Yeni şifre (tekrar)', autoComplete: 'new-password' },
};

export function PasswordForm() {
  const { toast } = useStore();
  const [f, setF] = useState<Record<Field, string>>({ current: '', next: '', repeat: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = f.next.length > 0 && f.next.length < 8;
  const mismatch = f.repeat.length > 0 && f.next !== f.repeat;

  return (
    <form
      id="password-form"
      className="card max-w-lg space-y-5 p-6 md:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        if (f.next.length < 8) return setError({ text: 'Yeni şifreniz en az 8 karakter olmalı.', field: 'next' });
        if (f.next !== f.repeat) return setError({ text: 'Yeni şifreler birbiriyle eşleşmiyor.', field: 'repeat' });
        setBusy(true);
        const res = await fetch('/api/account/password', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(f),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setBusy(false);
        if (!res || !res.ok) {
          setError({ text: data?.error || 'Şifreniz değiştirilemedi, lütfen tekrar deneyin.', field: data?.field });
          return;
        }
        setF({ current: '', next: '', repeat: '' });
        setDone(true);
        toast('Şifreniz değiştirildi.');
      }}
    >
      {(Object.keys(LABELS) as Field[]).map((k) => (
        <div key={k}>
          <label className="label" htmlFor={`pw-${k}`}>
            {LABELS[k].label}
          </label>
          <div className="relative">
            <input
              id={`pw-${k}`}
              type={show ? 'text' : 'password'}
              required
              minLength={k === 'current' ? 1 : 8}
              maxLength={100}
              value={f[k]}
              onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))}
              autoComplete={LABELS[k].autoComplete}
              aria-invalid={error?.field === k || (k === 'next' && tooShort) || (k === 'repeat' && mismatch) || undefined}
              className={`input pr-12 ${error?.field === k ? 'border-sale' : ''}`}
            />
            {k === 'current' && (
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Şifreleri gizle' : 'Şifreleri göster'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ink-muted hover:text-ink"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </div>
          {k === 'next' && <p className={`mt-1 text-2xs ${tooShort ? 'text-sale' : 'text-ink-muted'}`}>En az 8 karakter.</p>}
          {k === 'repeat' && mismatch && <p className="mt-1 text-2xs text-sale">Şifreler eşleşmiyor.</p>}
        </div>
      ))}
      {error && (
        <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale" role="alert">
          {error.text}
        </p>
      )}
      {done && (
        <p className="rounded-lg bg-ok/10 px-4 py-3 text-sm text-ok" role="status">
          Şifreniz başarıyla değiştirildi.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Şifremi Değiştir'}
        </button>
        <Link href="/forgot-password" className="link text-xs text-ink-soft">
          Mevcut şifrenizi mi unuttunuz?
        </Link>
      </div>
    </form>
  );
}
