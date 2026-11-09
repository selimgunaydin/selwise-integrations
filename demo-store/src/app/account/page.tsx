import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Bell, Heart, KeyRound, MapPin, Package, Ticket, UserRound } from 'lucide-react';
import { listAddresses, requireUser } from '@/lib/account/server';
import { loyaltyTier } from '@/lib/account/shared';
import { listOrders } from '@/lib/store/orders';
import { db } from '@/lib/store/db';
import { formatDate, formatPrice } from '@/lib/format';
import { Slot, SLOTS } from '@/components/selwise/Slot';
import { AccountHeading, StatusBadge } from '@/components/account/AccountHeading';

export const metadata: Metadata = { title: 'Hesabım' };

export default function AccountPage() {
  const user = requireUser('/account');
  const orders = listOrders(user.id);
  const recent = orders.slice(0, 3);
  const favoriteCount = (db().prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?').get(user.id) as { n: number }).n;
  const addressCount = listAddresses(user.id).length;
  const points = user.loyalty_points;
  const tier = loyaltyTier(points);
  const progress = tier.nextAt ? Math.min(100, Math.round(((points - tier.floor) / (tier.nextAt - tier.floor)) * 100)) : 100;

  const quick = [
    { href: '/account/siparislerim', label: 'Siparişlerim', sub: orders.length ? `${orders.length} sipariş` : 'Henüz sipariş yok', icon: Package },
    { href: '/account/favorilerim', label: 'Favorilerim', sub: favoriteCount ? `${favoriteCount} ürün` : 'Liste boş', icon: Heart },
    { href: '/account/adreslerim', label: 'Adreslerim', sub: addressCount ? `${addressCount} adres` : 'Adres ekleyin', icon: MapPin },
    { href: '/account/kuponlarim', label: 'Kuponlarım', sub: 'Size özel indirimler', icon: Ticket },
    { href: '/account/bilgilerim', label: 'Kullanıcı Bilgilerim', sub: 'Ad, telefon, doğum tarihi', icon: UserRound },
    { href: '/account/iletisim-tercihleri', label: 'İletişim Tercihleri', sub: 'E-posta, SMS, bildirim', icon: Bell },
    { href: '/account/sifre', label: 'Şifre Değiştir', sub: 'Hesap güvenliği', icon: KeyRound },
  ];

  return (
    <div>
      <AccountHeading
        eyebrow="Hesabım"
        title={`Merhaba, ${user.first_name}`}
        description={`${formatDate(user.created_at)} tarihinden beri Ardisa üyesisiniz.`}
      />

      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl bg-ink p-6 text-paper md:p-7" aria-labelledby="loyalty-title" id="account-loyalty">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-label text-paper/60">Ardisa Puan</p>
              <p id="loyalty-title" className="mt-2 font-display text-5xl leading-none">
                {points.toLocaleString('tr-TR')}
              </p>
            </div>
            <span className="rounded-full border border-paper/30 px-3 py-1 text-xs font-medium">{tier.label} üye</span>
          </div>
          <div className="mt-6">
            <div className="h-1.5 overflow-hidden rounded-full bg-paper/15" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Bir sonraki seviyeye ilerleme">
              <div className="h-full rounded-full bg-paper" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-3 text-xs text-paper/70">
              {tier.nextAt
                ? `${tier.nextLabel} seviyeye geçmek için ${(tier.nextAt - points).toLocaleString('tr-TR')} puan kaldı.`
                : 'En üst seviyedesiniz. Altın üyelere özel kampanyalardan ilk siz haberdar olursunuz.'}
            </p>
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-paper/15 pt-5 text-center text-2xs">
            {[
              ['Bronz', '0', 'bronze'],
              ['Gümüş', '500', 'silver'],
              ['Altın', '1.500', 'gold'],
            ].map(([label, at, key]) => (
              <div key={key} className={tier.key === key ? 'text-paper' : 'text-paper/50'}>
                <dt className="font-semibold uppercase tracking-label">{label}</dt>
                <dd className="mt-1">{at} puan</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-2xs text-paper/60">Her 10 TL’lik alışverişinize 1 Ardisa Puan kazanırsınız.</p>
        </section>

        <section className="card p-6 md:p-7" aria-labelledby="recent-orders">
          <div className="flex items-center justify-between">
            <h2 id="recent-orders" className="font-display text-xl">Son siparişlerim</h2>
            {orders.length > 0 && (
              <Link href="/account/siparislerim" className="link text-xs">Tümünü gör</Link>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="mt-6 rounded-xl bg-sand p-5 text-sm text-ink-soft">
              <p>Henüz siparişiniz yok. İlk siparişinizde <strong className="text-ink">HOSGELDIN10</strong> koduyla %10 indirim kazanın.</p>
              <Link href="/c/yeni-gelenler" className="btn-primary btn-sm mt-4">Alışverişe Başla</Link>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/account/siparislerim/${o.number}`} className="group flex items-center gap-3 py-3">
                    <div className="flex -space-x-3">
                      {o.lines.slice(0, 2).map((l, i) => (
                        <img key={`${l.code}-${l.size}-${i}`} src={l.image} alt="" className="h-12 w-10 rounded-md border-2 border-white bg-sand object-cover" />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">#{o.number}</p>
                      <p className="text-2xs text-ink-muted">{formatDate(o.createdAt)} · {formatPrice(o.total)}</p>
                    </div>
                    <StatusBadge status={o.status} label={o.statusLabel} />
                    <ArrowRight size={14} className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10" aria-labelledby="quick-links">
        <h2 id="quick-links" className="sr-only">Hızlı erişim</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {quick.map(({ href, label, sub, icon: Icon }) => (
            <Link key={href} href={href} className="card group flex flex-col gap-3 p-5 transition-colors hover:border-line-strong">
              <Icon size={20} strokeWidth={1.6} className="text-accent" />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-0.5 text-2xs text-ink-muted">{sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Slot name={SLOTS.accountRecs} className="mt-14 block" />
    </div>
  );
}
