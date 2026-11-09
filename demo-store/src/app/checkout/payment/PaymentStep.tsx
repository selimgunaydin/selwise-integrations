'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Banknote, CreditCard, Landmark, Lock, MapPin, Store } from 'lucide-react';
import type { PublicUser } from '@/lib/store/auth';
import { OrderSummary, type QuoteView } from '@/components/checkout/OrderSummary';
import { readDraft, savePending, type CheckoutDraft } from '@/lib/checkout/draft';
import { PICKUP_STORES } from '@/lib/pickup-stores';
import { checkoutOption } from '@/lib/selwise/client';
import { formatPrice } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { useStore } from '@/components/Providers';

type Method = 'card' | 'transfer' | 'cod';

const DEMO_CARD = { number: '4111 1111 1111 1111', expiry: '12/29', cvv: '123' };
const DECLINED = '4000000000000002';

function luhn(n: string) {
  const digits = n.replace(/\D/g, '');
  if (digits.length < 15) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function brandOf(n: string) {
  const d = n.replace(/\D/g, '');
  if (d.startsWith('9792')) return 'Troy';
  if (d.startsWith('4')) return 'VISA';
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'American Express';
  return '';
}

export function PaymentStep({ user }: { user: PublicUser | null }) {
  const router = useRouter();
  const { cart } = useStore();
  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [method, setMethod] = useState<Method>('card');
  const [installments, setInstallments] = useState(1);
  const [card, setCard] = useState({ holder: '', number: '', expiry: '', cvv: '' });
  const [quote, setQuote] = useState<(QuoteView & { installmentOptions: Array<{ n: number; total: number; monthly: number }> }) | null>(null);
  const [agree, setAgree] = useState(false);
  const [mEmail, setMEmail] = useState(false);
  const [mSms, setMSms] = useState(false);
  const [doc, setDoc] = useState<null | 'pre' | 'sales'>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = readDraft();
    if (!d) router.replace('/checkout/shipping');
    else setDraft(d);
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) setError(params.get('error'));
  }, [router]);

  const shippingMethod = draft?.delivery === 'store' ? 'store' : draft?.shippingMethod || 'standard';
  const refreshQuote = useCallback(async () => {
    const res = await fetch('/api/checkout/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shippingMethod, paymentMethod: method, installments: method === 'card' ? installments : 1 }),
    });
    if (res.ok) setQuote(await res.json());
  }, [shippingMethod, method, installments]);

  useEffect(() => {
    if (draft) void refreshQuote();
  }, [draft, refreshQuote, cart.total]);

  if (!draft) return null;
  const store = PICKUP_STORES.find((s) => s.id === draft.storeId);
  const codAllowed = (quote?.total ?? cart.total) < 5000;

  const submit = async () => {
    setError(null);
    if (!agree) return setError('Devam etmek için sözleşmeleri onaylamalısınız.');
    const payload = {
      email: draft.email,
      delivery: draft.delivery,
      storeId: draft.storeId,
      shippingAddress: draft.shippingAddress,
      billingAddress: draft.billingSame || !draft.billingAddress ? draft.shippingAddress : draft.billingAddress,
      corporate: draft.corporate || null,
      shippingMethod,
      paymentMethod: method,
      installments: method === 'card' ? installments : 1,
      marketingEmail: mEmail || !!user?.emailOptIn,
      marketingSms: mSms || !!user?.smsOptIn,
      agreements: true,
      saveAddress: draft.saveAddress,
      // Who a later "your order was delivered" is addressed to when nobody is signed in.
      visitorId: (window.Selwise as { getVisitorId?: () => string } | undefined)?.getVisitorId?.() || undefined,
    };
    checkoutOption(3, 'payment_method', method);
    if (method === 'card') {
      const digits = card.number.replace(/\D/g, '');
      if (!card.holder.trim()) return setError('Kart üzerindeki ismi girin.');
      if (!luhn(digits)) return setError('Kart numarası geçersiz.');
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)) return setError('Son kullanma tarihini AA/YY biçiminde girin.');
      if (!/^\d{3,4}$/.test(card.cvv)) return setError('Güvenlik kodu (CVV) geçersiz.');
      if (digits === DECLINED) {
        setError('Ödeme bankanız tarafından reddedildi. Lütfen başka bir kart deneyin. (Demo: reddedilen test kartı)');
        return;
      }
      savePending({ ...payload, card: { last4: digits.slice(-4), brand: brandOf(digits) || 'Kart' }, amount: quote?.total ?? cart.total });
      router.push('/checkout/3d-secure');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/checkout/place', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(data.error);
    }
    window.location.href = `/checkout/success/${data.token}`;
  };

  const brand = brandOf(card.number);

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]" id="checkout-payment">
      <div className="space-y-8">
        <section className="rounded-2xl border border-line bg-white p-5 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {draft.delivery === 'store' ? <Store size={18} className="mt-0.5 text-accent" /> : <MapPin size={18} className="mt-0.5 text-accent" />}
              <div>
                <p className="font-medium">{draft.delivery === 'store' ? `Mağazadan teslim: ${store?.name}` : `${draft.shippingAddress.title || 'Teslimat adresi'}`}</p>
                <p className="text-xs text-ink-muted">
                  {draft.shippingAddress.firstName} {draft.shippingAddress.lastName} · {draft.shippingAddress.phone}
                  <br />
                  {draft.delivery === 'store' ? `${store?.line}, ${store?.district} / ${store?.city}` : `${draft.shippingAddress.line}, ${draft.shippingAddress.district} / ${draft.shippingAddress.city}`}
                </p>
              </div>
            </div>
            <Link href="/checkout/shipping" className="text-xs underline underline-offset-4">Değiştir</Link>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl">Ödeme Yöntemi</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup">
            {[
              { k: 'card' as const, icon: CreditCard, title: 'Kredi / Banka Kartı', text: '12 aya varan taksit' },
              { k: 'transfer' as const, icon: Landmark, title: 'Havale / EFT', text: 'Ödeme onayından sonra kargo' },
              { k: 'cod' as const, icon: Banknote, title: 'Kapıda Ödeme', text: '+29,90 TL hizmet bedeli' },
            ].map((o) => (
              <button
                type="button"
                key={o.k}
                disabled={o.k === 'cod' && !codAllowed}
                onClick={() => {
                  setMethod(o.k);
                  setInstallments(1);
                }}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left disabled:opacity-40 ${method === o.k ? 'border-ink ring-1 ring-ink' : 'border-line-strong bg-white'}`}
                id={`pay-${o.k}`}
              >
                <o.icon size={20} className="text-accent" />
                <span className="text-sm font-medium">{o.title}</span>
                <span className="text-2xs text-ink-muted">{o.k === 'cod' && !codAllowed ? '5.000 TL üzeri siparişlerde kullanılamaz' : o.text}</span>
              </button>
            ))}
          </div>
        </section>

        {method === 'card' && (
          <section className="rounded-2xl border border-line bg-white p-6" id="card-form">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium"><Lock size={14} /> Kart Bilgileri</p>
              <button
                type="button"
                className="btn-ghost btn-sm"
                id="use-demo-card"
                onClick={() =>
                  setCard({ holder: `${draft.shippingAddress.firstName} ${draft.shippingAddress.lastName}`.toLocaleUpperCase('tr-TR'), ...DEMO_CARD })
                }
              >
                Demo kartı kullan
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="cc-holder">Kart üzerindeki isim</label>
                <input id="cc-holder" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} className="input" autoComplete="cc-name" />
              </div>
              <div className="relative sm:col-span-2">
                <label className="label" htmlFor="cc-number">Kart numarası</label>
                <input
                  id="cc-number"
                  inputMode="numeric"
                  value={card.number}
                  onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim() })}
                  className="input pr-28"
                  autoComplete="cc-number"
                  placeholder="0000 0000 0000 0000"
                />
                {brand && <span className="absolute bottom-3.5 right-4 text-xs font-semibold text-ink-soft">{brand}</span>}
              </div>
              <div>
                <label className="label" htmlFor="cc-exp">Son kullanma (AA/YY)</label>
                <input
                  id="cc-exp"
                  inputMode="numeric"
                  value={card.expiry}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setCard({ ...card, expiry: v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v });
                  }}
                  className="input"
                  autoComplete="cc-exp"
                  placeholder="AA/YY"
                />
              </div>
              <div>
                <label className="label" htmlFor="cc-cvv">Güvenlik kodu</label>
                <input id="cc-cvv" inputMode="numeric" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="input" autoComplete="cc-csc" placeholder="CVV" />
              </div>
            </div>
            {card.number.replace(/\D/g, '').length >= 6 && quote && (
              <div className="mt-6">
                <p className="text-sm font-medium">Taksit Seçenekleri</p>
                <div className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {quote.installmentOptions.map((o) => (
                    <label key={o.n} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm">
                      <input type="radio" name="inst" checked={installments === o.n} onChange={() => setInstallments(o.n)} className="accent-ink" />
                      <span className="flex-1">{o.n === 1 ? 'Tek çekim' : `${o.n} taksit`}</span>
                      <span className="text-xs text-ink-muted">{o.n > 1 ? `${o.n} x ${formatPrice(o.monthly)}` : ''}</span>
                      <span className="w-28 text-right font-medium">{formatPrice(o.total)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-4 text-2xs text-ink-muted">
              Demo mağaza: gerçek ödeme alınmaz, kart bilgisi saklanmaz. Reddedilen ödemeyi denemek için 4000 0000 0000 0002 kullanın.
            </p>
          </section>
        )}

        {method === 'transfer' && (
          <section className="rounded-2xl border border-line bg-white p-6 text-sm">
            <p className="font-medium">Havale / EFT bilgileri</p>
            <p className="mt-2 text-ink-soft">Siparişinizi tamamladıktan sonra aşağıdaki hesaplardan birine sipariş numaranızı açıklamaya yazarak ödeme yapın. Ödemeniz onaylanınca siparişiniz hazırlanır.</p>
            <ul className="mt-4 space-y-2 text-xs">
              {['Ardisa Bank · TR00 0000 0000 0000 0000 0000 01', 'Örnek Katılım · TR00 0000 0000 0000 0000 0000 02'].map((b) => (
                <li key={b} className="rounded-lg bg-sand px-4 py-3 font-mono">{b}</li>
              ))}
            </ul>
          </section>
        )}

        {method === 'cod' && (
          <section className="rounded-2xl border border-line bg-white p-6 text-sm text-ink-soft">
            Ödemeyi teslimat sırasında nakit veya kartla yapabilirsiniz. Kapıda ödeme için 29,90 TL hizmet bedeli eklenir.
          </section>
        )}

        <section className="space-y-3 rounded-2xl bg-sand p-5 text-xs text-ink-soft">
          <label className="flex items-start gap-2.5">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-ink" id="agree-contracts" />
            <span>
              <button type="button" className="link" onClick={() => setDoc('pre')}>Ön Bilgilendirme Formu</button>&apos;nu ve{' '}
              <button type="button" className="link" onClick={() => setDoc('sales')}>Mesafeli Satış Sözleşmesi</button>&apos;ni okudum, onaylıyorum.
            </span>
          </label>
          {!user?.emailOptIn && (
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={mEmail} onChange={(e) => setMEmail(e.target.checked)} className="mt-0.5 accent-ink" id="checkout-email-optin" />
              Kampanyalardan e-posta ile haberdar olmak istiyorum.
            </label>
          )}
          {!user?.smsOptIn && (
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={mSms} onChange={(e) => setMSms(e.target.checked)} className="mt-0.5 accent-ink" id="checkout-sms-optin" />
              Kampanyalardan SMS ile haberdar olmak istiyorum.
            </label>
          )}
        </section>
        {error && <p className="rounded-lg bg-sale/10 px-4 py-3 text-sm text-sale" id="payment-error">{error}</p>}
      </div>
      <OrderSummary quote={quote}>
        <button className="btn-primary mt-6 w-full" onClick={submit} disabled={busy} id="place-order">
          {busy ? 'Sipariş oluşturuluyor…' : 'Siparişi Tamamla'}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-2xs text-ink-muted"><Lock size={12} /> Güvenli ödeme</p>
      </OrderSummary>
      {doc && (
        <Modal title={doc === 'pre' ? 'Ön Bilgilendirme Formu' : 'Mesafeli Satış Sözleşmesi'} onClose={() => setDoc(null)} wide>
          <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
            <p><strong>Satıcı:</strong> Ardisa Mağazacılık A.Ş. (kurgusal) · Bu bir Selwise demo mağazasıdır.</p>
            <p><strong>Alıcı:</strong> {draft.shippingAddress.firstName} {draft.shippingAddress.lastName} · {draft.email}</p>
            <p><strong>Teslimat:</strong> {draft.delivery === 'store' ? store?.name : `${draft.shippingAddress.line}, ${draft.shippingAddress.district} / ${draft.shippingAddress.city}`}</p>
            <p><strong>Ürünler:</strong> {cart.lines.map((l) => `${l.title} (${l.size}) x${l.qty}`).join(', ')}</p>
            <p><strong>Toplam:</strong> {formatPrice(quote?.total ?? cart.total)} (KDV dahil)</p>
            <p>Alıcı, ürünü teslim aldığı tarihten itibaren 14 gün içinde herhangi bir gerekçe göstermeksizin cayma hakkına sahiptir. Ardisa bu süreyi 30 güne uzatmıştır. Cayma bildirimi hesabım sayfasından veya müşteri hizmetlerinden yapılabilir.</p>
            <p>Bu metin demo amaçlıdır; hiçbir hukuki bağlayıcılığı yoktur ve hiçbir ödeme alınmaz.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
