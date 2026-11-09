'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, Heart, KeyRound, LayoutGrid, LogOut, MapPin, Package, Ticket, UserRound, type LucideIcon } from 'lucide-react';
import { useStore } from '../Providers';
import { logoutEvent } from '@/lib/selwise/client';

const LINKS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/account', label: 'Hesabım', icon: LayoutGrid },
  { href: '/account/siparislerim', label: 'Siparişlerim', icon: Package },
  { href: '/account/favorilerim', label: 'Favorilerim', icon: Heart },
  { href: '/account/adreslerim', label: 'Adreslerim', icon: MapPin },
  { href: '/account/kuponlarim', label: 'Kuponlarım', icon: Ticket },
  { href: '/account/bilgilerim', label: 'Kullanıcı Bilgilerim', icon: UserRound },
  { href: '/account/iletisim-tercihleri', label: 'İletişim Tercihleri', icon: Bell },
  { href: '/account/sifre', label: 'Şifre Değiştir', icon: KeyRound },
];

function isActive(pathname: string, href: string) {
  return href === '/account' ? pathname === '/account' : pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountNav({ name, email }: { name: string; email: string }) {
  const pathname = usePathname() || '/account';
  const { setUser } = useStore();
  const [leaving, setLeaving] = useState(false);
  const mobileRef = useRef<HTMLElement>(null);

  // On a phone the row scrolls; keep the current section's chip in view.
  useEffect(() => {
    const row = mobileRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && chip) row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
  }, [pathname]);

  const logout = async () => {
    if (leaving) return;
    setLeaving(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    logoutEvent();
    setUser(null);
    // A full load: the data layer starts clean and the widget forgets the shopper.
    setTimeout(() => {
      window.location.href = '/';
    }, 400);
  };

  return (
    <>
      {/* Mobile: one horizontally scrolling row. */}
      <nav ref={mobileRef} aria-label="Hesap menüsü" className="no-scrollbar relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {LINKS.map(({ href, label }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-xs transition-colors ${
                active ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-white text-ink-soft hover:border-ink'
              }`}
            >
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={logout}
          disabled={leaving}
          className="inline-flex h-9 shrink-0 items-center rounded-full border border-line-strong bg-white px-4 text-xs text-ink-muted hover:border-ink"
        >
          {leaving ? 'Çıkış yapılıyor…' : 'Çıkış Yap'}
        </button>
      </nav>

      {/* Desktop: a sticky sidebar. */}
      <aside className="hidden lg:block">
        <div className="sticky top-32 rounded-2xl border border-line bg-white p-3">
          <div className="border-b border-line px-3 pb-4 pt-2">
            <p className="font-display text-lg leading-tight">{name}</p>
            <p className="mt-0.5 truncate text-2xs text-ink-muted">{email}</p>
          </div>
          <nav aria-label="Hesap menüsü" className="mt-2 space-y-0.5">
            {LINKS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active ? 'bg-sand font-medium text-ink' : 'text-ink-soft hover:bg-sand/60 hover:text-ink'
                  }`}
                >
                  <Icon size={16} strokeWidth={1.7} className={active ? 'text-accent' : 'text-ink-muted'} />
                  {label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={logout}
              disabled={leaving}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-muted transition-colors hover:bg-sand/60 hover:text-ink disabled:opacity-60"
            >
              <LogOut size={16} strokeWidth={1.7} />
              {leaving ? 'Çıkış yapılıyor…' : 'Çıkış Yap'}
            </button>
          </nav>
        </div>
      </aside>
    </>
  );
}
