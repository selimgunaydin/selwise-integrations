'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BellRing, Cookie, Mail, MessageSquare } from 'lucide-react';
import { useStore } from '../Providers';
import { openConsentPreferences, pushState, requestPush, setTraits, subscribeNewsletter } from '@/lib/selwise/client';
import { formatPhone } from '@/lib/account/shared';

type Channel = 'email' | 'sms';

const PUSH_LABEL: Record<string, { text: string; tone: string }> = {
  granted: { text: 'İzin verildi', tone: 'bg-ok/10 text-ok' },
  denied: { text: 'Engellendi', tone: 'bg-sale/10 text-sale' },
  default: { text: 'Henüz izin verilmedi', tone: 'bg-sand text-ink-soft' },
  unsupported: { text: 'Kullanılamıyor', tone: 'bg-sand text-ink-muted' },
};

const pushLabel = (s: string) => PUSH_LABEL[s === 'prompt' ? 'default' : s] ?? PUSH_LABEL.unsupported;

function Switch({ id, checked, disabled, onChange, label }: { id: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-ink' : 'bg-line-strong'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export function PreferencesPanel({
  siteKey,
  apiUrl,
  email,
  phone,
  fullName,
  initialEmail,
  initialSms,
}: {
  siteKey: string;
  apiUrl: string;
  email: string;
  phone: string | null;
  fullName: string;
  initialEmail: boolean;
  initialSms: boolean;
}) {
  const { toast, refresh } = useStore();
  const [prefs, setPrefs] = useState({ email: initialEmail, sms: initialSms });
  const [busy, setBusy] = useState<Channel | null>(null);
  const [push, setPush] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  // The widget loads after hydration; ask again shortly if it was not there yet.
  useEffect(() => {
    let cancelled = false;
    const read = () => pushState().then((s) => !cancelled && setPush(s)).catch(() => !cancelled && setPush('unsupported'));
    void read();
    const t = window.setTimeout(read, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  const toggle = async (channel: Channel, next: boolean) => {
    if (channel === 'sms' && next && !phone) {
      toast('SMS izni için önce telefon numaranızı ekleyin.', 'error');
      return;
    }
    setBusy(channel);
    const res = await fetch('/api/account/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(channel === 'email' ? { emailOptIn: next } : { smsOptIn: next }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setBusy(null);
      toast(data?.error || 'Tercihiniz kaydedilemedi.', 'error');
      return;
    }
    const saved = { email: !!data.user?.emailOptIn, sms: !!data.user?.smsOptIn };
    setPrefs(saved);
    setTraits({ email_opt_in: saved.email, sms_opt_in: saved.sms });
    // A permission given here is recorded through Selwise's consent door (the
    // newsletter endpoint), exactly like the footer and the register form.
    if (next && siteKey) {
      await subscribeNewsletter(siteKey, apiUrl, {
        email,
        fullName,
        phone: phone || undefined,
        sms: saved.sms,
        emailChannel: saved.email,
        source: 'account_preferences',
      }).catch(() => undefined);
    }
    await refresh();
    setBusy(null);
    toast(next ? 'İzniniz kaydedildi.' : 'İzniniz geri alındı.');
  };

  const askPush = async () => {
    setPushBusy(true);
    try {
      const result = await requestPush();
      setPush(result);
      if (result === 'granted') toast('Tarayıcı bildirimleri açıldı.');
      else if (result === 'denied') toast('Bildirim izni verilmedi.', 'error');
    } catch {
      setPush('unsupported');
    } finally {
      setPushBusy(false);
    }
  };

  const pushInfo = push ? pushLabel(push) : null;

  return (
    <div className="max-w-2xl space-y-4" id="contact-preferences">
      <section className="card divide-y divide-line" aria-label="Pazarlama izinleri">
        <div className="flex items-start gap-4 p-5 md:p-6">
          <Mail size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <label htmlFor="pref-email" className="text-sm font-medium">E-posta</label>
            <p className="mt-1 text-xs text-ink-soft">
              Yeni koleksiyonlar, size özel kampanyalar ve fiyatı düşen favorileriniz <span className="text-ink">{email}</span> adresine gelsin.
            </p>
          </div>
          <Switch id="pref-email" label="E-posta ile kampanya bildirimi" checked={prefs.email} disabled={busy !== null} onChange={(v) => toggle('email', v)} />
        </div>
        <div className="flex items-start gap-4 p-5 md:p-6">
          <MessageSquare size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <label htmlFor="pref-sms" className="text-sm font-medium">SMS</label>
            <p className="mt-1 text-xs text-ink-soft">
              {phone ? (
                <>Kampanya ve indirim kodları <span className="whitespace-nowrap text-ink">{formatPhone(phone)}</span> numarasına SMS olarak gelsin.</>
              ) : (
                <>
                  SMS izni için önce <Link href="/account/bilgilerim" className="link">Kullanıcı Bilgilerim</Link> sayfasından telefon numaranızı ekleyin.
                </>
              )}
            </p>
          </div>
          <Switch id="pref-sms" label="SMS ile kampanya bildirimi" checked={prefs.sms} disabled={busy !== null || (!phone && !prefs.sms)} onChange={(v) => toggle('sms', v)} />
        </div>
        <p className="px-5 py-4 text-2xs leading-relaxed text-ink-muted md:px-6">
          İzinlerinizi dilediğiniz zaman buradan geri alabilirsiniz. Ayrıntılar için{' '}
          <Link href="/sozlesmeler/kvkk-aydinlatma-metni" className="link">KVKK aydınlatma metnine</Link> bakın.
        </p>
      </section>

      <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start md:p-6" aria-labelledby="push-title">
        <BellRing size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p id="push-title" className="text-sm font-medium">Tarayıcı Bildirimleri</p>
            <span className={`rounded-full px-2.5 py-0.5 text-2xs font-semibold ${pushInfo?.tone ?? 'bg-sand text-ink-muted'}`} aria-live="polite">
              {pushInfo?.text ?? 'Kontrol ediliyor…'}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {push === 'denied'
              ? 'Bildirimler bu tarayıcıda engellenmiş. Adres çubuğundaki site ayarlarından izin verebilirsiniz.'
              : 'Stoğa giren favorileriniz ve sepetinizdeki ürünlerin fiyat düşüşleri anında ekranınıza gelsin.'}
          </p>
        </div>
        <button type="button" className="btn-outline btn-sm shrink-0" onClick={askPush} disabled={pushBusy || push === 'granted' || push === 'denied'}>
          {push === 'granted' ? 'Açık' : pushBusy ? 'Bekleniyor…' : 'Bildirimlere İzin Ver'}
        </button>
      </section>

      <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start md:p-6" aria-labelledby="cookie-title">
        <Cookie size={20} strokeWidth={1.6} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p id="cookie-title" className="text-sm font-medium">Çerez Tercihleri</p>
          <p className="mt-1 text-xs text-ink-soft">
            Analitik, kişiselleştirme ve pazarlama çerezlerine verdiğiniz izni değiştirin. <Link href="/sozlesmeler/cerez-politikasi" className="link">Çerez politikası</Link>
          </p>
        </div>
        <button type="button" data-selwise-consent="" className="btn-outline btn-sm shrink-0" onClick={() => openConsentPreferences()}>
          Çerez Tercihlerini Aç
        </button>
      </section>
    </div>
  );
}
