'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '../Providers';
import { setTraits } from '@/lib/selwise/client';
import { GENDERS, formatPhone as localPhone } from '@/lib/account/shared';

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthday: string;
  gender: string;
}

export function ProfileForm({ initial }: { initial: Profile }) {
  const { refresh, toast } = useStore();
  const [f, setF] = useState<Profile>({ ...initial, phone: localPhone(initial.phone) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const invalid = (k: keyof Profile) => (error?.field === k ? 'border-sale' : '');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      id="profile-form"
      className="card max-w-2xl space-y-5 p-6 md:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch('/api/account/profile', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ firstName: f.firstName, lastName: f.lastName, phone: f.phone, birthday: f.birthday, gender: f.gender }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setBusy(false);
        if (!res || !res.ok) {
          setError({ text: data?.error || 'Bilgileriniz kaydedilemedi, lütfen tekrar deneyin.', field: data?.field });
          return;
        }
        const u = data.user as { firstName: string; lastName: string; phone: string | null; birthday: string | null; gender: string | null };
        // `birthday` (yyyy-mm-dd) is the trait Selwise's date-based scenarios read.
        setTraits({
          firstName: u.firstName,
          lastName: u.lastName,
          fullName: `${u.firstName} ${u.lastName}`,
          birthday: u.birthday || null,
          gender: u.gender || null,
          phone_present: Boolean(u.phone),
          // Removing the phone also withdrew the SMS permission (api/account/profile).
          ...(u.phone ? {} : { sms_opt_in: false }),
        });
        setF((s) => ({ ...s, phone: localPhone(u.phone || '') }));
        await refresh();
        toast('Bilgileriniz güncellendi.');
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pf-first">Ad</label>
          <input id="pf-first" required minLength={2} maxLength={40} value={f.firstName} onChange={set('firstName')} className={`input ${invalid('firstName')}`} autoComplete="given-name" />
        </div>
        <div>
          <label className="label" htmlFor="pf-last">Soyad</label>
          <input id="pf-last" required minLength={2} maxLength={40} value={f.lastName} onChange={set('lastName')} className={`input ${invalid('lastName')}`} autoComplete="family-name" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pf-email">E-posta</label>
        <input id="pf-email" type="email" value={f.email} readOnly aria-describedby="pf-email-hint" className="input cursor-not-allowed bg-sand text-ink-muted" />
        <p id="pf-email-hint" className="mt-1 text-2xs text-ink-muted">
          E-posta adresinizi değiştirmek için <Link href="/iletisim" className="link">müşteri hizmetlerimize</Link> yazın.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pf-phone">
            Cep telefonu <span className="text-ink-faint">(isteğe bağlı)</span>
          </label>
          <input id="pf-phone" type="tel" value={f.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" className={`input ${invalid('phone')}`} autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="pf-birthday">
            Doğum tarihi <span className="text-ink-faint">(isteğe bağlı)</span>
          </label>
          <input id="pf-birthday" type="date" max={today} value={f.birthday} onChange={set('birthday')} className={`input ${invalid('birthday')}`} autoComplete="bday" />
        </div>
      </div>
      <div className="sm:w-1/2 sm:pr-2">
        <label className="label" htmlFor="pf-gender">Cinsiyet</label>
        <select id="pf-gender" value={f.gender} onChange={set('gender')} className={`input ${invalid('gender')}`}>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value="">Belirtmek istemiyorum</option>
        </select>
      </div>
      {error && (
        <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale" role="alert">
          {error.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Bilgilerimi Kaydet'}
        </button>
        <p className="text-2xs text-ink-muted">
          Bilgileriniz <Link href="/sozlesmeler/kvkk-aydinlatma-metni" className="link">aydınlatma metnine</Link> uygun olarak işlenir.
        </p>
      </div>
    </form>
  );
}
