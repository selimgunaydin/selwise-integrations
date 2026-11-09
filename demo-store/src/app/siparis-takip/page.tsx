import type { Metadata } from 'next';
import Link from 'next/link';
import { currentUser } from '@/lib/store/auth';
import { OrderLookup } from '@/components/content/OrderLookup';

export const metadata: Metadata = {
  title: 'Sipariş Takibi',
  description: 'Sipariş numaranız ve e-posta adresinizle siparişinizin durumunu öğrenin.',
};

export default function OrderTrackingPage() {
  const user = currentUser();
  return (
    <div className="container py-10 md:py-16" id="order-tracking">
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow">Sipariş Takibi</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">Siparişiniz nerede?</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Sipariş onay e-postanızdaki sipariş numarasını ve siparişte kullandığınız e-posta adresini girin.
          {user ? (
            <>
              {' '}Üye siparişlerinizin tamamını <Link href="/account/siparislerim" className="link">Siparişlerim</Link> sayfasında görebilirsiniz.
            </>
          ) : (
            <>
              {' '}Üyeyseniz <Link href="/login?next=%2Faccount%2Fsiparislerim" className="link">giriş yaparak</Link> tüm siparişlerinizi görebilirsiniz.
            </>
          )}
        </p>
        <OrderLookup defaultEmail={user?.email ?? ''} />
      </div>
    </div>
  );
}
