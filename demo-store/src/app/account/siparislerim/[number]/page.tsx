import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, CircleSlash, MessageCircle, Truck } from 'lucide-react';
import { findUserOrder, requireUser } from '@/lib/account/server';
import { CANCELLABLE, RETURNABLE, cargoTrackingNumber } from '@/lib/account/shared';
import { PAYMENT_METHODS, SHIPPING_METHODS, type OrderView } from '@/lib/store/orders';
import { formatDate, formatPrice } from '@/lib/format';
import { StatusBadge } from '@/components/account/AccountHeading';
import { CopyButton } from '@/components/account/CopyButton';

type Props = { params: { number: string } };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `Sipariş #${decodeURIComponent(params.number).toUpperCase()}` };
}

interface Step {
  key: string;
  label: string;
  at: string | null;
  done: boolean;
  current: boolean;
}

const HOUR = 36e5;
const plus = (iso: string, hours: number) => new Date(new Date(iso).getTime() + hours * HOUR).toISOString();

/**
 * The order's journey. Orders here move on by age (see `effectiveStatus` in
 * lib/store/orders.ts: 1h → preparing, 20h → shipped, 72h → delivered), so the
 * step times are derived from the same thresholds.
 */
function timeline(o: OrderView): Step[] {
  const pickup = o.shippingMethod === 'store';
  const request = o.requests[o.requests.length - 1];
  const base = [
    { key: 'received', label: 'Sipariş alındı', at: o.createdAt },
    { key: 'preparing', label: 'Hazırlanıyor', at: plus(o.createdAt, 1) },
    { key: 'shipped', label: pickup ? 'Mağazaya gönderildi' : 'Kargoya verildi', at: plus(o.createdAt, 20) },
    { key: 'delivered', label: pickup ? 'Teslim alındı' : 'Teslim edildi', at: plus(o.createdAt, 72) },
  ];
  let reached: number;
  switch (o.status) {
    case 'awaiting_payment':
      return [
        { key: 'awaiting', label: 'Ödeme bekleniyor', at: o.createdAt, done: false, current: true },
        ...base.map((s) => ({ ...s, at: null, done: false, current: false })),
      ];
    case 'received':
      reached = 0;
      break;
    case 'preparing':
      reached = 1;
      break;
    case 'shipped':
      reached = 2;
      break;
    case 'delivered':
      reached = 3;
      break;
    case 'return_requested':
    case 'returned': {
      const requestedAt = request?.created_at ?? o.createdAt;
      reached = new Date(requestedAt).getTime() >= new Date(base[3].at).getTime() ? 3 : 2;
      const steps: Step[] = base.slice(0, reached + 1).map((s) => ({ ...s, done: true, current: false }));
      steps.push({ key: 'return_requested', label: 'İade talebi alındı', at: requestedAt, done: o.status === 'returned', current: o.status === 'return_requested' });
      steps.push({ key: 'returned', label: 'İade tamamlandı', at: null, done: o.status === 'returned', current: o.status === 'returned' });
      return steps;
    }
    default:
      reached = 0;
  }
  return base.map((s, i) => ({ ...s, at: i <= reached ? s.at : null, done: i < reached || (i === reached && i === base.length - 1), current: i === reached }));
}

function AddressBlock({ title, a }: { title: string; a: OrderView['shippingAddress'] & { corporate?: { company: string; taxNo: string; taxOffice: string } } }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{title}</p>
      <div className="mt-3 space-y-0.5 text-sm text-ink-soft">
        {a.store && <p className="font-medium text-ink">Mağaza: {a.store}</p>}
        {a.corporate ? (
          <>
            <p className="font-medium text-ink">{a.corporate.company}</p>
            <p>
              VKN {a.corporate.taxNo} · {a.corporate.taxOffice} V.D.
            </p>
          </>
        ) : (
          <p className="font-medium text-ink">
            {a.firstName} {a.lastName}
          </p>
        )}
        <p>{a.line}</p>
        <p>
          {a.district} / {a.city} {a.postcode || ''}
        </p>
        {a.phone && <p>{a.phone}</p>}
      </div>
    </div>
  );
}

const REQUEST_LABEL: Record<string, string> = { cancel: 'İptal talebi', return: 'İade talebi' };
const REQUEST_STATUS: Record<string, string> = { approved: 'Onaylandı', pending: 'İnceleniyor', rejected: 'Reddedildi', completed: 'Tamamlandı' };

export default function OrderDetailPage({ params }: Props) {
  const number = decodeURIComponent(params.number);
  const user = requireUser(`/account/siparislerim/${encodeURIComponent(number)}`);
  const o = findUserOrder(user.id, number);
  if (!o) notFound();

  const steps = timeline(o);
  const shippingLabel = SHIPPING_METHODS[o.shippingMethod]?.label ?? o.shippingMethod;
  const paymentLabel = PAYMENT_METHODS[o.paymentMethod]?.label ?? o.paymentMethod;
  const shipped = ['shipped', 'delivered', 'return_requested', 'returned'].includes(o.status) && o.shippingMethod !== 'store';
  const tracking = shipped ? cargoTrackingNumber(o.number) : null;
  const canCancel = CANCELLABLE.includes(o.status);
  const canReturn = RETURNABLE.includes(o.status);
  const itemsBase = o.subtotal - o.discount + o.shipping + o.paymentFee + o.giftWrap;
  const installmentFee = Math.round((o.total - itemsBase) * 100) / 100;
  const cancelledAt = o.status === 'cancelled' ? (o.requests.find((r) => r.kind === 'cancel')?.created_at ?? null) : null;

  return (
    <div id="account-order-detail">
      <Link href="/account/siparislerim" className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
        <ArrowLeft size={14} /> Siparişlerim
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{formatDate(o.createdAt, true)}</p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl">Sipariş #{o.number}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            <StatusBadge status={o.status} label={o.statusLabel} />
            <span>{o.lines.reduce((s, l) => s + l.qty, 0)} ürün · {formatPrice(o.total)}</span>
          </div>
        </div>
        {(canCancel || canReturn) && (
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <Link href={`/account/siparislerim/${o.number}/talep`} className="btn-outline btn-sm">
                İptal Et
              </Link>
            )}
            {canReturn && (
              <Link href={`/account/siparislerim/${o.number}/talep`} className="btn-primary btn-sm">
                İade Talebi Oluştur
              </Link>
            )}
          </div>
        )}
      </div>

      {o.status === 'cancelled' ? (
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-sale/20 bg-sale/5 p-5 text-sm">
          <CircleSlash size={18} className="mt-0.5 shrink-0 text-sale" />
          <div>
            <p className="font-medium text-ink">Bu sipariş iptal edildi{cancelledAt ? ` (${formatDate(cancelledAt, true)})` : ''}.</p>
            <p className="mt-1 text-ink-soft">
              {o.paymentMethod === 'cod'
                ? 'Kapıda ödeme seçtiğiniz için sizden herhangi bir ücret alınmadı.'
                : 'Ödemeniz, kullandığınız ödeme yöntemine 3-10 iş günü içinde iade edilir.'}
            </p>
          </div>
        </div>
      ) : (
        <section className="card mt-8 p-5 md:p-6" aria-label="Sipariş durumu">
          <ol className="grid gap-4 sm:grid-flow-col sm:auto-cols-fr sm:gap-2">
            {steps.map((s, i) => (
              <li key={s.key} className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={`absolute -top-4 left-[13px] h-4 w-px sm:-left-1/2 sm:right-1/2 sm:top-[13px] sm:h-px sm:w-auto ${s.done || s.current ? 'bg-ink' : 'bg-line-strong'}`}
                  />
                )}
                <span
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold ${
                    s.done ? 'border-ink bg-ink text-paper' : s.current ? 'border-ink bg-white text-ink' : 'border-line-strong bg-white text-ink-faint'
                  }`}
                  aria-hidden
                >
                  {s.done ? <Check size={14} /> : i + 1}
                </span>
                <div>
                  <p className={`text-sm ${s.done || s.current ? 'font-medium text-ink' : 'text-ink-muted'}`}>
                    {s.label}
                    {s.current && <span className="sr-only"> (güncel durum)</span>}
                  </p>
                  {s.at && <p className="mt-0.5 text-2xs text-ink-muted">{formatDate(s.at, true)}</p>}
                </div>
              </li>
            ))}
          </ol>
          {tracking && (
            <div className="mt-6 flex flex-col gap-3 rounded-xl bg-sand p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Truck size={18} strokeWidth={1.6} className="shrink-0 text-accent" />
                <div>
                  <p className="text-2xs uppercase tracking-label text-ink-muted">Kargo takip numarası · Ardisa Kargo</p>
                  <p className="font-medium tracking-wide">{tracking}</p>
                </div>
              </div>
              <CopyButton value={tracking} />
            </div>
          )}
          {o.status === 'awaiting_payment' && (
            <p className="mt-6 rounded-xl bg-warn/10 p-4 text-sm text-ink-soft">
              Havale/EFT ödemeniz hesabımıza ulaştığında siparişiniz hazırlanmaya başlar. Açıklama alanına sipariş numaranızı (#{o.number}) yazmayı unutmayın.
            </p>
          )}
        </section>
      )}

      <section className="mt-8" aria-labelledby="order-lines">
        <h2 id="order-lines" className="font-display text-xl">Ürünler</h2>
        <ul className="card mt-4 divide-y divide-line">
          {o.lines.map((l, i) => (
            <li key={`${l.code}-${l.size}-${i}`} className="flex gap-4 p-4">
              <Link href={`/p/${l.slug}`} className="shrink-0">
                <img src={l.image} alt={l.title} className="h-24 w-20 rounded-lg bg-sand object-cover" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <p lang="en" className="text-2xs uppercase tracking-label text-ink-muted">{l.brand}</p>
                  <Link href={`/p/${l.slug}`} className="text-sm font-medium hover:underline">
                    {l.title}
                  </Link>
                  <p className="mt-1 text-xs text-ink-muted">
                    {l.colorName} · Beden: {l.size} · {l.qty} adet
                  </p>
                </div>
                <div className="text-sm sm:text-right">
                  <p className="font-medium">{formatPrice(l.lineTotal)}</p>
                  {l.qty > 1 && <p className="text-2xs text-ink-muted">Birim {formatPrice(l.price)}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <AddressBlock title={o.shippingAddress.store ? 'Teslimat noktası' : 'Teslimat adresi'} a={o.shippingAddress} />
        <AddressBlock title="Fatura adresi" a={o.billingAddress} />
        <div className="card p-5">
          <p className="eyebrow">Teslimat ve ödeme</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-2xs text-ink-muted">Teslimat yöntemi</dt>
              <dd className="text-ink">{shippingLabel}</dd>
            </div>
            <div>
              <dt className="text-2xs text-ink-muted">Ödeme yöntemi</dt>
              <dd className="text-ink">
                {paymentLabel}
                {o.paymentMethod === 'card' && o.installments > 1 ? ` · ${o.installments} taksit` : ''}
              </dd>
            </div>
            {o.giftNote && (
              <div>
                <dt className="text-2xs text-ink-muted">Hediye notu</dt>
                <dd className="text-ink-soft">“{o.giftNote}”</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <section className="card mt-8 p-5 md:max-w-md md:p-6 lg:ml-auto" aria-labelledby="order-totals">
        <h2 id="order-totals" className="eyebrow">Ödeme özeti</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Ara toplam</dt>
            <dd>{formatPrice(o.subtotal)}</dd>
          </div>
          {o.discount > 0 && (
            <div className="flex justify-between text-ok">
              <dt>İndirim{o.coupon ? ` (${o.coupon})` : ''}</dt>
              <dd>−{formatPrice(o.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-soft">Kargo</dt>
            <dd>{o.shipping > 0 ? formatPrice(o.shipping) : 'Ücretsiz'}</dd>
          </div>
          {o.giftWrap > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">Hediye paketi</dt>
              <dd>{formatPrice(o.giftWrap)}</dd>
            </div>
          )}
          {o.paymentFee > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">Kapıda ödeme bedeli</dt>
              <dd>{formatPrice(o.paymentFee)}</dd>
            </div>
          )}
          {installmentFee > 0.01 && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">Vade farkı</dt>
              <dd>{formatPrice(installmentFee)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
            <dt>Toplam</dt>
            <dd>{formatPrice(o.total)}</dd>
          </div>
        </dl>
      </section>

      {o.requests.length > 0 && (
        <section className="mt-8" aria-labelledby="order-requests">
          <h2 id="order-requests" className="font-display text-xl">Talepler</h2>
          <ul className="card mt-4 divide-y divide-line text-sm">
            {o.requests.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{REQUEST_LABEL[r.kind] ?? r.kind}</p>
                  <p className="text-2xs text-ink-muted">
                    {formatDate(r.created_at, true)} · Neden: {r.reason}
                  </p>
                </div>
                <span className="rounded-full bg-sand px-2.5 py-1 text-2xs font-semibold text-ink-soft">{REQUEST_STATUS[r.status] ?? r.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 flex items-center gap-2 text-xs text-ink-muted">
        <MessageCircle size={12} aria-hidden /> Sorunuz mu var? Sipariş numaranızla <Link href="/iletisim" className="link">bize yazın</Link>.
      </p>
    </div>
  );
}
