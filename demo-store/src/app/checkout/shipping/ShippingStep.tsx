'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MapPin, Store, Truck, Zap } from 'lucide-react';
import type { PublicUser } from '@/lib/store/auth';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { readDraft, saveDraft, type CheckoutDraft } from '@/lib/checkout/draft';
import { PICKUP_STORES } from '@/lib/pickup-stores';
import { checkoutOption } from '@/lib/selwise/client';
import { useStore } from '@/components/Providers';
import { formatPrice } from '@/lib/format';
import { DEMO_ADDRESS } from '@/lib/checkout/demo-data';
import { TR_CITIES } from '@/lib/account/shared';

export interface SavedAddress {
  id: number;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  city: string;
  district: string;
  line: string;
  postcode: string | null;
  is_default: number;
}


const emptyAddress = { title: 'Ev', firstName: '', lastName: '', phone: '', city: 'İstanbul', district: '', line: '', postcode: '' };

export function ShippingStep({ user, addresses, guest }: { user: PublicUser | null; addresses: SavedAddress[]; guest: boolean }) {
  const router = useRouter();
  const { cart } = useStore();
  const [mode, setMode] = useState<'choose' | 'form'>(user || guest ? 'form' : 'choose');
  const [selected, setSelected] = useState<number | 'new'>(addresses[0]?.id ?? 'new');
  const [d, setD] = useState<CheckoutDraft>({
    email: user?.email || '',
    phone: user?.phone || '',
    delivery: 'address',
    storeId: PICKUP_STORES[0].id,
    shippingAddress: { ...emptyAddress, firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '' },
    billingSame: true,
    corporate: null,
    shippingMethod: 'standard',
    saveAddress: !!user,
  });
  const [corporate, setCorporate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = readDraft();
    if (prev) setD((cur) => ({ ...cur, ...prev, email: prev.email || cur.email }));
  }, []);

  if (mode === 'choose') {
    return (
      <div className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2" id="checkout-auth-choice">
        <div className="rounded-2xl border border-line bg-white p-8">
          <p className="font-display text-2xl">Üye Girişi</p>
          <p className="mt-2 text-sm text-ink-soft">Kayıtlı adreslerinizi kullanın, Ardisa Puan kazanın.</p>
          <Link href="/login?next=/checkout/shipping" className="btn-primary mt-6 w-full">Giriş Yap</Link>
          <Link href="/register?next=/checkout/shipping" className="btn-ghost mt-2 w-full">Üye Ol</Link>
        </div>
        <div className="rounded-2xl border border-line bg-white p-8">
          <p className="font-display text-2xl">Üye Olmadan Devam Et</p>
          <p className="mt-2 text-sm text-ink-soft">Siparişinizi e-posta adresinizle takip edebilirsiniz.</p>
          <button className="btn-outline mt-6 w-full" onClick={() => setMode('form')} id="checkout-guest">
            Misafir Olarak Devam Et
          </button>
        </div>
      </div>
    );
  }

  const setAddr = (k: keyof typeof emptyAddress) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((s) => ({ ...s, shippingAddress: { ...s.shippingAddress, [k]: e.target.value } }));

  const fillDemoAddress = () =>
    setD((s) => ({
      ...s,
      shippingAddress: {
        ...s.shippingAddress,
        title: DEMO_ADDRESS.title,
        firstName: s.shippingAddress.firstName || DEMO_ADDRESS.firstName,
        lastName: s.shippingAddress.lastName || DEMO_ADDRESS.lastName,
        phone: s.shippingAddress.phone || DEMO_ADDRESS.phone,
        city: DEMO_ADDRESS.city,
        district: DEMO_ADDRESS.district,
        line: DEMO_ADDRESS.line,
        postcode: DEMO_ADDRESS.postcode,
      },
    }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let shippingAddress = d.shippingAddress;
    if (user && selected !== 'new' && d.delivery === 'address') {
      const a = addresses.find((x) => x.id === selected)!;
      shippingAddress = { title: a.title, firstName: a.first_name, lastName: a.last_name, phone: a.phone, city: a.city, district: a.district, line: a.line, postcode: a.postcode || '' };
    }
    if (d.delivery === 'store') {
      // Pickup still needs a name and phone for the SMS.
      shippingAddress = { ...shippingAddress, district: shippingAddress.district || '-', line: shippingAddress.line || 'Mağazadan teslim' };
    }
    if (!shippingAddress.firstName || !shippingAddress.lastName || !shippingAddress.phone) return setError('Ad, soyad ve telefon zorunludur.');
    if (d.delivery === 'address' && (!shippingAddress.district || shippingAddress.line.length < 5)) return setError('Lütfen adres bilgilerinizi eksiksiz girin.');
    const draft: CheckoutDraft = {
      ...d,
      shippingAddress,
      phone: shippingAddress.phone,
      corporate: corporate ? d.corporate : null,
      saveAddress: !!user && selected === 'new' && d.saveAddress,
    };
    saveDraft(draft);
    checkoutOption(2, 'shipping_method', d.delivery === 'store' ? 'store' : d.shippingMethod);
    router.push('/checkout/payment');
  };

  return (
    <form onSubmit={submit} className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]" id="checkout-shipping-form">
      <div className="space-y-8">
        <section>
          <h2 className="font-display text-2xl">İletişim</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="co-email">E-posta</label>
              <input id="co-email" type="email" required value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} className="input" disabled={!!user} />
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl">Teslimat Şekli</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { k: 'address' as const, icon: Truck, title: 'Adrese Teslim', text: 'Kargo ile kapınıza' },
              { k: 'store' as const, icon: Store, title: 'Mağazadan Teslim Al', text: 'Ücretsiz · 1-2 iş günü' },
            ].map((o) => (
              <button
                type="button"
                key={o.k}
                onClick={() => setD({ ...d, delivery: o.k })}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left ${d.delivery === o.k ? 'border-ink ring-1 ring-ink' : 'border-line-strong bg-white'}`}
              >
                <o.icon size={20} className="mt-0.5 text-accent" />
                <span>
                  <span className="block text-sm font-medium">{o.title}</span>
                  <span className="text-xs text-ink-muted">{o.text}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {d.delivery === 'store' ? (
          <section>
            <h2 className="font-display text-2xl">Mağaza Seçin</h2>
            <div className="mt-4 space-y-2">
              {PICKUP_STORES.map((s) => (
                <label key={s.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${d.storeId === s.id ? 'border-ink' : 'border-line-strong bg-white'}`}>
                  <input type="radio" name="store" checked={d.storeId === s.id} onChange={() => setD({ ...d, storeId: s.id })} className="mt-1 accent-ink" />
                  <span>
                    <span className="block text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-ink-muted">{s.line}, {s.district} / {s.city}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <input required placeholder="Ad" value={d.shippingAddress.firstName} onChange={setAddr('firstName')} className="input" />
              <input required placeholder="Soyad" value={d.shippingAddress.lastName} onChange={setAddr('lastName')} className="input" />
              <input required placeholder="+905xxxxxxxxx" value={d.shippingAddress.phone} onChange={setAddr('phone')} className="input" />
            </div>
          </section>
        ) : (
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl">Teslimat Adresi</h2>
              {(!user || selected === 'new' || addresses.length === 0) && (
                <button type="button" className="btn-ghost btn-sm" id="use-demo-address" onClick={fillDemoAddress}>
                  Demo adresi kullan
                </button>
              )}
            </div>
            {user && addresses.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => (
                  <label key={a.id} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${selected === a.id ? 'border-ink ring-1 ring-ink' : 'border-line-strong bg-white'}`}>
                    <input type="radio" name="addr" checked={selected === a.id} onChange={() => setSelected(a.id)} className="mt-1 accent-ink" />
                    <span className="text-xs">
                      <span className="flex items-center gap-1.5 text-sm font-medium"><MapPin size={13} /> {a.title}</span>
                      <span className="mt-1 block text-ink-soft">{a.first_name} {a.last_name} · {a.phone}</span>
                      <span className="block text-ink-muted">{a.line}, {a.district} / {a.city}</span>
                    </span>
                  </label>
                ))}
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-sm ${selected === 'new' ? 'border-ink' : 'border-line-strong'}`}>
                  <input type="radio" name="addr" checked={selected === 'new'} onChange={() => setSelected('new')} className="accent-ink" /> Yeni adres ekle
                </label>
              </div>
            )}
            {(!user || selected === 'new' || addresses.length === 0) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2" id="checkout-address-form">
                <div>
                  <label className="label" htmlFor="a-first">Ad</label>
                  <input id="a-first" required value={d.shippingAddress.firstName} onChange={setAddr('firstName')} className="input" autoComplete="given-name" />
                </div>
                <div>
                  <label className="label" htmlFor="a-last">Soyad</label>
                  <input id="a-last" required value={d.shippingAddress.lastName} onChange={setAddr('lastName')} className="input" autoComplete="family-name" />
                </div>
                <div>
                  <label className="label" htmlFor="a-phone">Cep telefonu</label>
                  <input id="a-phone" required placeholder="+905xxxxxxxxx" value={d.shippingAddress.phone} onChange={setAddr('phone')} className="input" autoComplete="tel" />
                </div>
                <div>
                  <label className="label" htmlFor="a-title">Adres başlığı</label>
                  <input id="a-title" value={d.shippingAddress.title || ''} onChange={setAddr('title')} className="input" placeholder="Ev, İş…" />
                </div>
                <div>
                  <label className="label" htmlFor="a-city">İl</label>
                  <select id="a-city" value={d.shippingAddress.city} onChange={setAddr('city')} className="input">
                    {TR_CITIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="a-district">İlçe</label>
                  <input id="a-district" required value={d.shippingAddress.district} onChange={setAddr('district')} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="a-line">Açık adres</label>
                  <input id="a-line" required value={d.shippingAddress.line} onChange={setAddr('line')} className="input" placeholder="Mahalle, cadde, sokak, bina ve daire no" autoComplete="street-address" />
                </div>
                <div>
                  <label className="label" htmlFor="a-post">Posta kodu</label>
                  <input id="a-post" value={d.shippingAddress.postcode || ''} onChange={setAddr('postcode')} className="input" autoComplete="postal-code" />
                </div>
                {user && (
                  <label className="flex items-center gap-2 self-end pb-3 text-xs text-ink-soft">
                    <input type="checkbox" checked={!!d.saveAddress} onChange={(e) => setD({ ...d, saveAddress: e.target.checked })} className="accent-ink" /> Bu adresi kaydet
                  </label>
                )}
              </div>
            )}
          </section>
        )}

        <section>
          <h2 className="font-display text-2xl">Fatura Bilgileri</h2>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.billingSame} onChange={(e) => setD({ ...d, billingSame: e.target.checked })} className="accent-ink" /> Faturamı teslimat adresime gönder
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={corporate} onChange={(e) => setCorporate(e.target.checked)} className="accent-ink" /> Kurumsal fatura istiyorum
          </label>
          {corporate && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <input required placeholder="Firma adı" className="input" onChange={(e) => setD({ ...d, corporate: { ...(d.corporate || { taxNo: '', taxOffice: '' }), company: e.target.value } as never })} />
              <input required placeholder="Vergi no" className="input" onChange={(e) => setD({ ...d, corporate: { ...(d.corporate || { company: '', taxOffice: '' }), taxNo: e.target.value } as never })} />
              <input required placeholder="Vergi dairesi" className="input" onChange={(e) => setD({ ...d, corporate: { ...(d.corporate || { company: '', taxNo: '' }), taxOffice: e.target.value } as never })} />
            </div>
          )}
        </section>

        {d.delivery === 'address' && (
          <section>
            <h2 className="font-display text-2xl">Kargo Seçenekleri</h2>
            <div className="mt-4 space-y-2">
              {[
                { k: 'standard' as const, icon: Truck, title: 'Standart Teslimat', eta: '2-4 iş günü', price: cart.freeShipping ? 0 : 59.9 },
                { k: 'express' as const, icon: Zap, title: 'Hızlı Teslimat', eta: 'Ertesi iş günü', price: 89.9 },
              ].map((o) => (
                <label key={o.k} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${d.shippingMethod === o.k ? 'border-ink' : 'border-line-strong bg-white'}`}>
                  <input type="radio" name="ship" checked={d.shippingMethod === o.k} onChange={() => setD({ ...d, shippingMethod: o.k })} className="accent-ink" />
                  <o.icon size={18} className="text-accent" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{o.title}</span>
                    <span className="text-xs text-ink-muted">{o.eta}</span>
                  </span>
                  <span className="text-sm font-medium">{o.price === 0 ? <span className="text-ok">Ücretsiz</span> : formatPrice(o.price)}</span>
                </label>
              ))}
            </div>
          </section>
        )}
        {error && <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale">{error}</p>}
      </div>
      <OrderSummary>
        <button className="btn-primary mt-6 w-full" id="checkout-to-payment">Ödeme Adımına Geç</button>
      </OrderSummary>
    </form>
  );
}
