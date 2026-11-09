import type { Metadata } from 'next';
import Link from 'next/link';
import { Gift, Ticket } from 'lucide-react';
import { orderCount, requireUser } from '@/lib/account/server';
import { db } from '@/lib/store/db';
import { formatPrice } from '@/lib/format';
import { AccountHeading } from '@/components/account/AccountHeading';
import { CopyButton } from '@/components/account/CopyButton';

export const metadata: Metadata = { title: 'Kuponlarım' };

interface CouponRow {
  code: string;
  kind: 'percent' | 'amount' | 'shipping';
  value: number;
  min_total: number;
  description: string;
}

/** The welcome code is first-order only, so it is shown as "earned" to a shopper with no orders and nowhere else. */
const WELCOME = 'HOSGELDIN10';

function badge(c: CouponRow) {
  if (c.kind === 'percent') return `%${c.value}`;
  if (c.kind === 'amount') return formatPrice(c.value).replace(',00', '');
  return 'Kargo';
}

function CouponCard({ c, highlight = false }: { c: CouponRow; highlight?: boolean }) {
  return (
    <li className={`card flex overflow-hidden ${highlight ? 'border-accent/40' : ''}`}>
      <div className={`flex w-24 shrink-0 flex-col items-center justify-center border-r border-dashed border-line-strong px-2 text-center sm:w-28 ${highlight ? 'bg-accent-soft' : 'bg-sand'}`}>
        <span className="font-display text-2xl leading-none text-ink">{badge(c)}</span>
        <span className="mt-1 text-2xs uppercase tracking-label text-ink-muted">{c.kind === 'shipping' ? 'ücretsiz' : 'indirim'}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold tracking-wider">{c.code}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{c.description}</p>
          <p className="mt-1 text-2xs text-ink-muted">
            {c.min_total > 0 ? `En az ${formatPrice(c.min_total)} sepet tutarında geçerli.` : 'Alt limit yok.'} Sepet sayfasında kullanılır.
          </p>
        </div>
        <CopyButton value={c.code} />
      </div>
    </li>
  );
}

export default function CouponsPage() {
  const user = requireUser('/account/kuponlarim');
  const coupons = db().prepare('SELECT code, kind, value, min_total, description FROM coupons WHERE active = 1 ORDER BY min_total, code').all() as CouponRow[];
  const firstOrder = orderCount(user.id) === 0;
  const welcome = coupons.find((c) => c.code === WELCOME);
  const earned = firstOrder && welcome ? [welcome] : [];
  const general = coupons.filter((c) => c.code !== WELCOME);

  return (
    <div>
      <AccountHeading eyebrow="Hesabım" title="Kuponlarım" description="Kupon kodunu kopyalayıp sepet sayfasındaki kupon alanına yapıştırın. Her siparişte tek kupon kullanılabilir." />

      <section aria-labelledby="earned-coupons">
        <h2 id="earned-coupons" className="flex items-center gap-2 font-display text-xl">
          <Gift size={18} strokeWidth={1.6} className="text-accent" /> Kazanılan
        </h2>
        {earned.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {earned.map((c) => (
              <CouponCard key={c.code} c={c} highlight />
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl bg-sand p-5 text-sm text-ink-soft">
            Şu anda size özel tanımlanmış bir kupon yok. Bültenimize katılan ve sepetini tamamlayan üyelerimize özel kodlar gönderiyoruz.
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="all-coupons">
        <h2 id="all-coupons" className="flex items-center gap-2 font-display text-xl">
          <Ticket size={18} strokeWidth={1.6} className="text-accent" /> Kampanya kuponları
        </h2>
        {general.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {general.map((c) => (
              <CouponCard key={c.code} c={c} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">Şu anda geçerli bir kampanya kuponu yok.</p>
        )}
      </section>

      <p className="mt-10 text-xs text-ink-muted">
        Güncel kampanyaların tamamı için <Link href="/kampanyalar" className="link">Kampanyalar</Link> sayfasına göz atın.
      </p>
    </div>
  );
}
