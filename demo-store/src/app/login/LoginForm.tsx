'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '@/components/Providers';
import { userEvent } from '@/lib/selwise/client';

export function LoginForm({ next }: { next: string }) {
  const { setUser, refresh } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <form
        id="login-form"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error);
            setBusy(false);
            return;
          }
          setUser(data.user);
          userEvent('user_login', data.user);
          await refresh();
          // Give the data layer a beat to send user_login before the page changes.
          setTimeout(() => {
            window.location.href = next;
          }, 350);
        }}
      >
        <div>
          <label className="label" htmlFor="login-email">E-posta</label>
          <input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="login-password">Şifre</label>
            <Link href="/forgot-password" className="mb-1.5 text-xs text-ink-soft underline underline-offset-4">Şifremi unuttum</Link>
          </div>
          <input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </div>
        {error && <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}</button>
      </form>
      <div className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-soft">
        Hesabınız yok mu?{' '}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-medium text-ink underline underline-offset-4">Üye olun</Link>
      </div>
    </>
  );
}
