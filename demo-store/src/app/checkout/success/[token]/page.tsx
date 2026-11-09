import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Landmark } from 'lucide-react';
import { getOrderByToken, PAYMENT_METHODS, SHIPPING_METHODS } from '@/lib/store/orders';
import { currentUser, selwiseUserId } from '@/lib/store/auth';
import { formatDate, formatPrice } from '@/lib/format';
import { SuccessTracker } from './SuccessTracker';
import { Slot, SLOTS } from '@/components/selwise/Slot';

export const metadata: Metadata = { title: 'Siparişiniz Alındı' };

export default function SuccessPage({ params }: { params: { token: string } }) {
  const order = getOrderByToken(params.token);
  if (!order) notFound();
  const user = currentUser();
  const isOwnerGuest = !user;
  return (
    <div className="mx-auto mt-10 max-w-3xl" id="order-success" data-order-number={order.number}>
      <SuccessTracker
        order={{
          number: order.number,
          total: order.total,
          subtotal: order.subtotal,
          discount: order.discount,
          shipping: order.shipping,
          coupon: order.coupon,
          status: order.paymentMethod === 'transfer' ? 'pending' : 'completed',
          createdAt: order.createdAt,
          email: order.email,
          phone: order.shippingAddress.phone,
          marketingEmail: false,
          marketingSms: false,
          selwiseUserId: user ? selwiseUserId(user) : null,
          shippingCity: order.shippingAddress.city,
          shippingDistrict: order.shippingAddress.district,
          shippingMethod: order.shippingMethod,
          paymentMethod: order.paymentMethod,
          installments: order.installments,
          lines: order.lines.map((l) => ({ code: l.code, title: l.title, qty: l.qty, price: l.price, lineTotal: l.lineTotal, size: l.size, colorName: l.colorName, category: l.category })),
        }}
        token={params.token}
      />
      <div className="rounded-2xl border border-line bg-white p-8 text-center">
        <CheckCircle2 size={48} className="mx-auto text-ok" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-4xl">Teşekkürler, siparişiniz alındı!</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Sipariş numaranız <strong id="order-number">{order.number}</strong>. Sipariş özetini <strong>{order.email}</strong> adresine gönderdik.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {user ? (
            <Link href={`/account/siparislerim/${order.number}`} className="btn-primary">Siparişimi Görüntüle</Link>
          ) : (
            <Link href="/siparis-takip" className="btn-primary">Sipariş Takibi</Link>
          )}
          <Link href="/" className="btn-outline">Alışverişe Devam Et</Link>
        </div>
      </div>

      {order.paymentMethod === 'transfer' && (
        <div className="mt-6 flex gap-4 rounded-2xl border border-warn/30 bg-white p-6 text-sm">
          <Landmark className="shrink-0 text-warn" />
          <div>
            <p className="font-medium">Ödemeniz bekleniyor</p>
            <p className="mt-1 text-ink-soft">
              {formatPrice(order.total)} tutarındaki ödemeyi açıklamaya <strong>{order.number}</strong> yazarak 48 saat içinde yapın. Ödeme onaylanınca siparişiniz hazırlanır.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-6 text-sm">
          <p className="eyebrow">Teslimat</p>
          <p className="mt-3 font-medium">{order.shippingAddress.firstName} {order.shippingAddress.lastName}</p>
          <p className="text-ink-soft">{order.shippingAddress.line}</p>
          <p className="text-ink-soft">{order.shippingAddress.district} / {order.shippingAddress.city}</p>
          <p className="mt-3 text-xs text-ink-muted">{SHIPPING_METHODS[order.shippingMethod].label} · {SHIPPING_METHODS[order.shippingMethod].eta}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 text-sm">
          <p className="eyebrow">Ödeme</p>
          <p className="mt-3 font-medium">{PAYMENT_METHODS[order.paymentMethod].label}{order.installments > 1 ? ` · ${order.installments} taksit` : ''}</p>
          <p className="text-ink-soft">{formatDate(order.createdAt, true)}</p>
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between"><dt className="text-ink-muted">Ara toplam</dt><dd>{formatPrice(order.subtotal)}</dd></div>
            {order.discount > 0 && <div className="flex justify-between text-sale"><dt>İndirim ({order.coupon})</dt><dd>-{formatPrice(order.discount)}</dd></div>}
            <div className="flex justify-between"><dt className="text-ink-muted">Kargo</dt><dd>{order.shipping ? formatPrice(order.shipping) : 'Ücretsiz'}</dd></div>
            {order.paymentFee > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Hizmet bedeli</dt><dd>{formatPrice(order.paymentFee)}</dd></div>}
            {order.giftWrap > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Hediye paketi</dt><dd>{formatPrice(order.giftWrap)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold"><dt>Toplam</dt><dd>{formatPrice(order.total)}</dd></div>
          </dl>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white px-6">
        {order.lines.map((l) => (
          <li key={`${l.code}-${l.size}`} className="flex items-center gap-4 py-4">
            <img src={l.image} alt="" className="h-20 w-16 rounded-lg object-cover" />
            <div className="flex-1 text-sm">
              <Link href={`/p/${l.slug}`} className="font-medium hover:underline">{l.title}</Link>
              <p className="text-xs text-ink-muted">Beden: {l.size} · Adet: {l.qty}</p>
            </div>
            <p className="text-sm font-semibold">{formatPrice(l.lineTotal)}</p>
          </li>
        ))}
      </ul>

      {isOwnerGuest && (
        <div className="mt-6 rounded-2xl bg-sand p-6 text-center">
          <p className="font-display text-2xl">Üye olun, siparişlerinizi kolayca takip edin</p>
          <p className="mt-1 text-sm text-ink-soft">Bu siparişten Ardisa Puan kazanın, bir sonraki alışverişinizde kullanın.</p>
          <Link href={`/register?next=/account`} className="btn-primary mt-4">Hemen Üye Ol</Link>
        </div>
      )}

      <Slot name={SLOTS.successRecs} className="mt-16 block" />
    </div>
  );
}
