import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Package } from 'lucide-react';
import { requireUser } from '@/lib/account/server';
import { listOrders } from '@/lib/store/orders';
import { formatDate, formatPrice } from '@/lib/format';
import { AccountHeading, EmptyState, StatusBadge } from '@/components/account/AccountHeading';

export const metadata: Metadata = { title: 'Siparişlerim' };

export default function OrdersPage() {
  const user = requireUser('/account/siparislerim');
  const orders = listOrders(user.id);

  return (
    <div>
      <AccountHeading eyebrow="Hesabım" title="Siparişlerim" description="Siparişlerinizin durumunu izleyin, iptal veya iade talebi oluşturun." />

      {orders.length === 0 ? (
        <EmptyState
          icon={<Package size={24} strokeWidth={1.6} />}
          title="Henüz siparişiniz yok"
          text="Verdiğiniz siparişler burada listelenir. İlk siparişinizde HOSGELDIN10 koduyla %10 indirim kazanın."
          action={<Link href="/c/yeni-gelenler" className="btn-primary">Alışverişe Başla</Link>}
        />
      ) : (
        <ul className="space-y-4">
          {orders.map((o) => {
            const itemCount = o.lines.reduce((s, l) => s + l.qty, 0);
            const thumbs = o.lines.slice(0, 4);
            const more = o.lines.length - thumbs.length;
            return (
              <li key={o.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line bg-paper/60 px-5 py-4 text-xs">
                  <div>
                    <p className="text-ink-muted">Sipariş no</p>
                    <p className="mt-0.5 font-medium text-ink">#{o.number}</p>
                  </div>
                  <div>
                    <p className="text-ink-muted">Tarih</p>
                    <p className="mt-0.5 font-medium text-ink">{formatDate(o.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-ink-muted">Tutar</p>
                    <p className="mt-0.5 font-medium text-ink">{formatPrice(o.total)}</p>
                  </div>
                  <div className="ml-auto">
                    <StatusBadge status={o.status} label={o.statusLabel} />
                  </div>
                </div>
                <Link href={`/account/siparislerim/${o.number}`} className="group flex items-center gap-4 px-5 py-4">
                  <div className="flex flex-1 items-center gap-2 overflow-hidden">
                    {thumbs.map((l, i) => (
                      <img key={`${l.code}-${l.size}-${i}`} src={l.image} alt={l.title} className="h-20 w-16 shrink-0 rounded-lg bg-sand object-cover" />
                    ))}
                    {more > 0 && (
                      <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-sand text-xs font-medium text-ink-soft">+{more}</span>
                    )}
                    <p className="ml-2 hidden text-xs text-ink-muted sm:block">{itemCount} ürün</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
                    Detayları Gör <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
