import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { findUserOrder, requireUser } from '@/lib/account/server';
import { requestKindFor } from '@/lib/account/shared';
import { OrderRequestForm } from '@/components/account/OrderRequestForm';
import { StatusBadge } from '@/components/account/AccountHeading';

type Props = { params: { number: string } };

export const metadata: Metadata = { title: 'İptal / İade Talebi' };

export default function OrderRequestPage({ params }: Props) {
  const number = decodeURIComponent(params.number);
  const user = requireUser(`/account/siparislerim/${encodeURIComponent(number)}/talep`);
  const o = findUserOrder(user.id, number);
  if (!o) notFound();
  const kind = requestKindFor(o.status);
  const back = `/account/siparislerim/${o.number}`;

  return (
    <div id="account-order-request">
      <Link href={back} className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink">
        <ArrowLeft size={14} /> Sipariş #{o.number}
      </Link>
      <div className="mt-4">
        <p className="eyebrow">Sipariş #{o.number}</p>
        <h1 className="mt-1 font-display text-3xl md:text-4xl">{kind === 'return' ? 'İade Talebi Oluştur' : kind === 'cancel' ? 'Siparişi İptal Et' : 'Talep Oluştur'}</h1>
        <div className="mt-3">
          <StatusBadge status={o.status} label={o.statusLabel} />
        </div>
      </div>

      {kind ? (
        <OrderRequestForm
          number={o.number}
          kind={kind}
          backHref={back}
          lines={o.lines.map((l) => ({ code: l.code, title: l.title, size: l.size, qty: l.qty, colorName: l.colorName, image: l.image, lineTotal: l.lineTotal }))}
        />
      ) : (
        <div className="card mt-8 p-6 text-sm text-ink-soft">
          <p>
            Bu sipariş için şu anda yeni bir talep oluşturulamaz ({o.statusLabel.toLocaleLowerCase('tr-TR')}). Yardıma ihtiyacınız varsa{' '}
            <Link href="/iletisim" className="link">müşteri hizmetlerimize</Link> yazabilirsiniz.
          </p>
          <Link href={back} className="btn-outline btn-sm mt-5">Sipariş detayına dön</Link>
        </div>
      )}
    </div>
  );
}
