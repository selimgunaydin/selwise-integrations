'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ link: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="container max-w-md py-16">
      <h1 className="font-display text-4xl">Şifremi Unuttum</h1>
      <p className="mt-2 text-sm text-ink-soft">E-posta adresinizi girin, şifre sıfırlama bağlantısı gönderelim.</p>
      {result ? (
        <div className="mt-8 space-y-4 rounded-xl border border-line bg-white p-6 text-sm">
          <p>Bu adrese kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.</p>
          {result.link && (
            <div className="rounded-lg bg-sand p-4 text-xs">
              <p className="font-semibold">Demo kısayolu</p>
              <p className="mt-1 text-ink-soft">Demo mağaza e-posta göndermez. Bağlantınız:</p>
              <Link href={result.link} className="link mt-2 block break-all font-mono">{result.link}</Link>
            </div>
          )}
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await fetch('/api/auth/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
            const data = await res.json();
            if (!res.ok) setError(data.error);
            else setResult(data);
          }}
        >
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresiniz" className="input" />
          {error && <p className="text-sm text-sale">{error}</p>}
          <button className="btn-primary w-full">Bağlantı Gönder</button>
          <Link href="/login" className="block text-center text-sm text-ink-soft underline underline-offset-4">Girişe dön</Link>
        </form>
      )}
    </div>
  );
}
