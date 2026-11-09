'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Gift, Heart, Minus, Plus, Tag, Trash2, ShieldCheck, RotateCcw } from 'lucide-react';
import { useStore } from '@/components/Providers';
import { FreeShippingBar } from '@/components/cart/FreeShippingBar';
import { formatPrice } from '@/lib/format';
import { GIFT_WRAP_PRICE } from '@/lib/store/constants';
import { cartView } from '@/lib/selwise/client';

export function CartPageClient() {
  const { cart, setQty, removeLine, applyCoupon, setGift, toggleFavorite, favorites, busy, user } = useStore();
  const [coupon, setCoupon] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [note, setNote] = useState(cart.giftNote || '');
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    cartView(cart);
    // once per visit to the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cart.lines.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-line bg-white px-6 py-16 text-center" id="cart-empty">
        <p className="font-display text-3xl">Sepetiniz şu an boş</p>
        <p className="mt-2 text-sm text-ink-muted">Size özel seçtiğimiz ürünlere göz atın ya da kategorileri keşfedin.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/c/yeni-gelenler" className="btn-primary">Yeni Gelenler</Link>
          {user && favorites.length > 0 && <Link href="/account/favorilerim" className="btn-outline">Favorilerim ({favorites.length})</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]" id="cart">
      <div>
        <div className="rounded-xl border border-line bg-white p-4">
          <FreeShippingBar remaining={cart.freeShippingRemaining} free={cart.freeShipping} />
        </div>
        <ul className="mt-6 divide-y divide-line border-y border-line" id="cart-lines">
          {cart.lines.map((l) => (
            <li key={`${l.code}-${l.size}`} className="flex gap-5 py-6" data-cart-line={l.code}>
              <Link href={`/p/${l.slug}`} className="shrink-0">
                <img src={l.image} alt="" className="h-36 w-28 rounded-xl object-cover" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p lang="en" className="text-2xs uppercase tracking-label text-ink-muted">{l.brand}</p>
                    <Link href={`/p/${l.slug}`} className="mt-1 block truncate text-sm font-medium hover:underline">{l.title}</Link>
                    <p className="mt-1 text-xs text-ink-muted">
                      Renk: {l.colorName} · Beden: {l.size}
                    </p>
                    {l.qty >= l.maxQty && <p className="mt-1 text-xs text-warn">Stokta yalnızca {l.maxQty} adet var.</p>}
                  </div>
                  <div className="text-right">
                    {l.listPrice > l.price && <p className="text-xs text-ink-faint line-through">{formatPrice(l.listPrice * l.qty)}</p>}
                    <p className={`text-sm font-semibold ${l.listPrice > l.price ? 'text-sale' : ''}`}>{formatPrice(l.lineTotal)}</p>
                    {l.qty > 1 && <p className="text-2xs text-ink-muted">Adet: {formatPrice(l.price)}</p>}
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <div className="flex h-10 items-center rounded-full border border-line-strong">
                    <button disabled={busy} onClick={() => setQty(l, l.qty - 1)} className="px-3" aria-label="Azalt">
                      <Minus size={14} />
                    </button>
                    <span className="w-7 text-center text-sm">{l.qty}</span>
                    <button disabled={busy || l.qty >= l.maxQty} onClick={() => setQty(l, l.qty + 1)} className="px-3 disabled:opacity-30" aria-label="Artır">
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-soft">
                    {user && (
                      <button
                        className="flex items-center gap-1.5 hover:text-ink"
                        onClick={async () => {
                          if (!favorites.includes(l.code)) await toggleFavorite(l.code, l.price);
                          await removeLine(l);
                        }}
                      >
                        <Heart size={14} /> Favorilere taşı
                      </button>
                    )}
                    <button className="flex items-center gap-1.5 hover:text-ink" onClick={() => removeLine(l)} disabled={busy}>
                      <Trash2 size={14} /> Kaldır
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-xl border border-line bg-white p-5">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-ink"
              checked={cart.giftWrap}
              onChange={(e) => setGift(e.target.checked, note || null)}
              id="cart-gift-wrap"
            />
            <Gift size={16} className="text-accent" />
            Hediye paketi istiyorum <span className="text-ink-muted">(+{formatPrice(GIFT_WRAP_PRICE)})</span>
          </label>
          {cart.giftWrap && (
            <textarea
              value={note}
              maxLength={240}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => setGift(true, note || null)}
              placeholder="Hediye notunuz (isteğe bağlı)"
              className="input mt-3 h-24 py-3"
            />
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start" id="cart-summary">
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="font-display text-2xl">Sipariş Özeti</p>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Ürünler ({cart.itemCount})</dt>
              <dd>{formatPrice(cart.listSubtotal)}</dd>
            </div>
            {cart.listSubtotal > cart.subtotal && (
              <div className="flex justify-between text-sale">
                <dt>Ürün indirimleri</dt>
                <dd>-{formatPrice(cart.listSubtotal - cart.subtotal)}</dd>
              </div>
            )}
            {cart.coupon && (
              <div className="flex justify-between text-sale">
                <dt>Kupon ({cart.coupon.code})</dt>
                <dd>{cart.discount > 0 ? `-${formatPrice(cart.discount)}` : 'Kargo bedava'}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-muted">Kargo</dt>
              <dd>{cart.shipping === 0 ? <span className="text-ok">Ücretsiz</span> : formatPrice(cart.shipping)}</dd>
            </div>
            {cart.giftWrap && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Hediye paketi</dt>
                <dd>{formatPrice(cart.giftWrapTotal)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <dt>Toplam</dt>
              <dd id="cart-total">{formatPrice(cart.total)}</dd>
            </div>
          </dl>

          <div className="mt-5">
            {cart.coupon ? (
              <div className="flex items-center justify-between rounded-lg bg-ok/10 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-ok">
                  <Tag size={14} /> <strong>{cart.coupon.code}</strong> uygulandı
                </span>
                <button className="text-xs underline" onClick={() => applyCoupon(null)}>Kaldır</button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                id="coupon-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setCouponError(await applyCoupon(coupon.trim().toUpperCase()));
                }}
              >
                <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="İndirim kodu" className="input h-11 uppercase" id="coupon-input" />
                <button className="btn-outline h-11 shrink-0 px-5">Uygula</button>
              </form>
            )}
            {(couponError || cart.couponNotice) && <p className="mt-2 text-xs text-sale">{couponError || cart.couponNotice}</p>}
          </div>

          <Link href="/checkout/shipping" className="btn-primary mt-6 w-full" id="cart-checkout">
            Sepeti Onayla
          </Link>
          <div className="mt-5 space-y-2 text-xs text-ink-muted">
            <p className="flex items-center gap-2"><ShieldCheck size={14} /> 256-bit SSL ve 3D Secure ile güvenli ödeme</p>
            <p className="flex items-center gap-2"><RotateCcw size={14} /> 30 gün içinde ücretsiz iade</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
