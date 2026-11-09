'use client';

import Link from 'next/link';
import { useStore } from '../Providers';
import { formatPrice } from '@/lib/format';

export interface QuoteView {
  shipping: number;
  paymentFee: number;
  installmentFee: number;
  total: number;
}

export function OrderSummary({ quote, children }: { quote?: QuoteView | null; children?: React.ReactNode }) {
  const { cart } = useStore();
  const shipping = quote ? quote.shipping : cart.shipping;
  const total = quote ? quote.total : cart.total;
  return (
    <aside className="lg:sticky lg:top-28 lg:self-start" id="checkout-summary">
      <div className="rounded-2xl border border-line bg-white p-6">
        <div className="flex items-center justify-between">
          <p className="font-display text-2xl">Sipariş Özeti</p>
          <Link href="/cart" className="text-xs underline underline-offset-4">Sepeti düzenle</Link>
        </div>
        <ul className="mt-5 max-h-64 space-y-4 overflow-y-auto pr-1">
          {cart.lines.map((l) => (
            <li key={`${l.code}-${l.size}`} className="flex gap-3">
              <div className="relative shrink-0">
                <img src={l.image} alt="" className="h-20 w-16 rounded-lg object-cover" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-paper">{l.qty}</span>
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-medium">{l.title}</p>
                <p className="text-ink-muted">Beden: {l.size}</p>
              </div>
              <p className="text-xs font-semibold">{formatPrice(l.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-muted">Ara toplam</dt><dd>{formatPrice(cart.subtotal)}</dd></div>
          {cart.discount > 0 && (
            <div className="flex justify-between text-sale"><dt>Kupon ({cart.coupon?.code})</dt><dd>-{formatPrice(cart.discount)}</dd></div>
          )}
          <div className="flex justify-between"><dt className="text-ink-muted">Kargo</dt><dd>{shipping === 0 ? <span className="text-ok">Ücretsiz</span> : formatPrice(shipping)}</dd></div>
          {cart.giftWrap && <div className="flex justify-between"><dt className="text-ink-muted">Hediye paketi</dt><dd>{formatPrice(cart.giftWrapTotal)}</dd></div>}
          {quote && quote.paymentFee > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Kapıda ödeme hizmet bedeli</dt><dd>{formatPrice(quote.paymentFee)}</dd></div>}
          {quote && quote.installmentFee > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Vade farkı</dt><dd>{formatPrice(quote.installmentFee)}</dd></div>}
          <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
            <dt>Toplam</dt>
            <dd id="checkout-total">{formatPrice(total)}</dd>
          </div>
        </dl>
        {children}
      </div>
    </aside>
  );
}
