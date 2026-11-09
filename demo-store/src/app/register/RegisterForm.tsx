'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '@/components/Providers';
import { subscribeNewsletter, userEvent } from '@/lib/selwise/client';

export function RegisterForm({ next, siteKey, apiUrl }: { next: string; siteKey: string; apiUrl: string }) {
  const { setUser, refresh } = useStore();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', birthday: '', gender: '', emailOptIn: false, smsOptIn: false, terms: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <form
      id="register-form"
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error);
          setBusy(false);
          return;
        }
        setUser(data.user);
        userEvent('user_signup', data.user);
        // Marketing permission is recorded through Selwise's consent door (the
        // newsletter endpoint), never inferred from an identify call.
        if (siteKey && (f.emailOptIn || f.smsOptIn)) {
          await subscribeNewsletter(siteKey, apiUrl, {
            email: data.user.email,
            fullName: `${data.user.firstName} ${data.user.lastName}`,
            phone: data.user.phone || undefined,
            sms: f.smsOptIn,
            emailChannel: f.emailOptIn,
            source: 'register',
          }).catch(() => undefined);
        }
        await refresh();
        setTimeout(() => {
          window.location.href = next;
        }, 350);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="reg-first">Ad</label>
          <input id="reg-first" required value={f.firstName} onChange={set('firstName')} className="input" autoComplete="given-name" />
        </div>
        <div>
          <label className="label" htmlFor="reg-last">Soyad</label>
          <input id="reg-last" required value={f.lastName} onChange={set('lastName')} className="input" autoComplete="family-name" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="reg-email">E-posta</label>
        <input id="reg-email" type="email" required value={f.email} onChange={set('email')} className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="reg-password">Şifre</label>
        <input id="reg-password" type="password" required minLength={8} value={f.password} onChange={set('password')} className="input" autoComplete="new-password" />
        <p className="mt-1 text-2xs text-ink-muted">En az 8 karakter.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="reg-phone">Cep telefonu <span className="text-ink-faint">(isteğe bağlı)</span></label>
          <input id="reg-phone" type="tel" placeholder="+905xxxxxxxxx" value={f.phone} onChange={set('phone')} className="input" autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="reg-birthday">Doğum tarihi <span className="text-ink-faint">(isteğe bağlı)</span></label>
          <input id="reg-birthday" type="date" value={f.birthday} onChange={set('birthday')} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="reg-gender">Cinsiyet <span className="text-ink-faint">(isteğe bağlı)</span></label>
        <select id="reg-gender" value={f.gender} onChange={set('gender')} className="input">
          <option value="">Belirtmek istemiyorum</option>
          <option value="Kadın">Kadın</option>
          <option value="Erkek">Erkek</option>
        </select>
      </div>
      <div className="space-y-2.5 rounded-xl bg-sand p-4 text-xs text-ink-soft">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" checked={f.emailOptIn} onChange={set('emailOptIn')} className="mt-0.5 accent-ink" id="reg-email-optin" />
          Kampanya ve yeniliklerden e-posta ile haberdar olmak istiyorum.
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" checked={f.smsOptIn} onChange={set('smsOptIn')} className="mt-0.5 accent-ink" id="reg-sms-optin" />
          Kampanya ve yeniliklerden SMS ile haberdar olmak istiyorum.
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" required checked={f.terms} onChange={set('terms')} className="mt-0.5 accent-ink" id="reg-terms" />
          <span>
            <Link href="/sozlesmeler/uyelik-sozlesmesi" className="link" target="_blank">Üyelik sözleşmesini</Link> ve{' '}
            <Link href="/sozlesmeler/kvkk-aydinlatma-metni" className="link" target="_blank">aydınlatma metnini</Link> okudum, kabul ediyorum.
          </span>
        </label>
      </div>
      {error && <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Hesabınız oluşturuluyor…' : 'Üye Ol'}</button>
      <p className="text-center text-sm text-ink-soft">
        Zaten üye misiniz? <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-ink underline underline-offset-4">Giriş yapın</Link>
      </p>
    </form>
  );
}
