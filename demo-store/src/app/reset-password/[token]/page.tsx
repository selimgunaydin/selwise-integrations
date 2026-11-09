'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <div className="container max-w-md py-16">
      <h1 className="font-display text-4xl">Yeni Şifre Belirle</h1>
      {done ? (
        <div className="mt-8 space-y-4">
          <p className="text-sm">Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.</p>
          <Link href="/login" className="btn-primary w-full">Giriş Yap</Link>
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password !== repeat) return setError('Şifreler eşleşmiyor.');
            const res = await fetch('/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: params.token, password }) });
            const data = await res.json();
            if (!res.ok) setError(data.error);
            else setDone(true);
          }}
        >
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Yeni şifre" className="input" />
          <input type="password" required minLength={8} value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="Yeni şifre (tekrar)" className="input" />
          {error && <p className="text-sm text-sale">{error}</p>}
          <button className="btn-primary w-full">Şifreyi Güncelle</button>
        </form>
      )}
    </div>
  );
}
