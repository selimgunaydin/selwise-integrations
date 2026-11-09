'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Menu, Search, ShoppingBag, User, X, ChevronRight, MapPin, Truck, Headphones } from 'lucide-react';
import { useStore } from '../Providers';
import { MiniCart } from './MiniCart';
import type { MenuCategory } from './menu';
import { logoutEvent } from '@/lib/selwise/client';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`font-display text-[28px] font-semibold leading-none tracking-tight text-ink ${className}`} aria-label="Ardisa ana sayfa">
      ardisa<span className="text-accent">.</span>
    </Link>
  );
}

export function Header({ menu }: { menu: MenuCategory[] }) {
  const { cart, favorites, user, setMiniCartOpen } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const openMenu = (slug: string) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(slug);
  };
  const scheduleClose = () => {
    closeTimer.current = window.setTimeout(() => setOpen(null), 120);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur" id="site-header">
      <div className="hidden border-b border-line bg-white text-2xs text-ink-soft md:block">
        <div className="container flex h-9 items-center justify-between">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <Truck size={13} /> 750 TL ve üzeri siparişlerde ücretsiz kargo
            </span>
            <span className="text-ink-faint">·</span>
            <span>30 gün içinde ücretsiz iade</span>
          </div>
          <nav className="flex items-center gap-5">
            <Link href="/siparis-takip" className="hover:text-ink">Sipariş Takibi</Link>
            <Link href="/magazalar" className="flex items-center gap-1 hover:text-ink">
              <MapPin size={12} /> Mağazalar
            </Link>
            <Link href="/yardim" className="flex items-center gap-1 hover:text-ink">
              <Headphones size={12} /> Yardım
            </Link>
          </nav>
        </div>
      </div>

      <div className="container flex h-16 items-center gap-4 md:h-[72px]">
        <button className="-ml-2 p-2 lg:hidden" onClick={() => setMobile(true)} aria-label="Menüyü aç">
          <Menu size={22} />
        </button>
        <Logo />

        <nav className="ml-4 hidden h-full items-stretch lg:flex xl:ml-8" onMouseLeave={scheduleClose}>
          {menu.map((c) => (
            <div key={c.slug} className="flex items-stretch" onMouseEnter={() => openMenu(c.slug)}>
              <Link
                href={`/c/${c.slug}`}
                className={`flex items-center whitespace-nowrap px-2.5 text-sm transition-colors xl:px-3 ${open === c.slug ? 'text-accent' : 'text-ink hover:text-accent'}`}
              >
                {c.short}
              </Link>
            </div>
          ))}
          <div className="flex items-stretch" onMouseEnter={() => setOpen(null)}>
            <Link href="/c/indirim" className="flex items-center whitespace-nowrap px-2.5 text-sm font-semibold text-sale xl:px-3">
              İndirim
            </Link>
          </div>
          {open && (
            <MegaPanel
              category={menu.find((m) => m.slug === open)!}
              onEnter={() => openMenu(open)}
              onLeave={scheduleClose}
              onNavigate={() => setOpen(null)}
            />
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <SearchBox />
          <AccountMenu />
          <Link href="/account/favorilerim" className="relative hidden p-2 md:block" aria-label="Favorilerim">
            <Heart size={21} strokeWidth={1.6} />
            {favorites.length > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-paper">
                {favorites.length}
              </span>
            )}
          </Link>
          <button className="relative p-2" onClick={() => setMiniCartOpen(true)} aria-label={`Sepetim, ${cart.itemCount} ürün`} id="header-cart">
            <ShoppingBag size={21} strokeWidth={1.6} />
            {cart.itemCount > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white" data-cart-count>
                {cart.itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {mobile && <MobileMenu menu={menu} onClose={() => setMobile(false)} signedIn={!!user} />}
      <MiniCart />
    </header>
  );
}

function MegaPanel({ category, onEnter, onLeave, onNavigate }: { category: MenuCategory; onEnter: () => void; onLeave: () => void; onNavigate: () => void }) {
  return (
    <div className="absolute inset-x-0 top-full border-b border-line bg-white shadow-pop animate-fade-in" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="container grid grid-cols-12 gap-8 py-8">
        <div className="col-span-3">
          <p className="eyebrow mb-4">{category.name}</p>
          <ul className="space-y-2.5">
            <li>
              <Link href={`/c/${category.slug}`} onClick={onNavigate} className="text-sm font-semibold hover:text-accent">
                Tümünü Gör
              </Link>
            </li>
            {category.children.map((s) => (
              <li key={s.slug}>
                <Link href={`/c/${s.slug}`} onClick={onNavigate} className="text-sm text-ink-soft hover:text-accent">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-3">
          <p className="eyebrow mb-4">Öne Çıkanlar</p>
          <ul className="space-y-2.5 text-sm text-ink-soft">
            <li><Link href="/c/yeni-gelenler" onClick={onNavigate} className="hover:text-accent">Yeni Gelenler</Link></li>
            <li><Link href="/c/cok-satanlar" onClick={onNavigate} className="hover:text-accent">Çok Satanlar</Link></li>
            <li><Link href="/c/indirim" onClick={onNavigate} className="text-sale hover:text-accent">İndirimdekiler</Link></li>
            <li><Link href="/kampanyalar" onClick={onNavigate} className="hover:text-accent">Kampanyalar</Link></li>
          </ul>
        </div>
        <div className="col-span-6 grid grid-cols-2 gap-4">
          {category.featured.map((f) => (
            <Link key={f.slug} href={`/c/${f.slug}`} onClick={onNavigate} className="group block overflow-hidden rounded-xl bg-sand">
              <img src={`/img/c/${f.slug}.svg`} alt="" className="aspect-[5/4] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <p className="px-4 py-3 text-sm font-medium">{f.name}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="relative hidden md:block"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      {/* Selwise search binds this input as the store field (placement.input.selectors "#site-search").
          Without Selwise the form still submits to /search. */}
      <input
        id="site-search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ürün, kategori veya renk ara"
        autoComplete="off"
        className="h-10 w-56 rounded-full border border-line-strong bg-white pl-10 pr-4 text-sm placeholder:text-ink-faint focus:border-ink focus:outline-none lg:w-52 xl:w-72"
      />
    </form>
  );
}

function AccountMenu() {
  const { user, setUser, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    logoutEvent();
    setUser(null);
    // A full load after logout: the data layer starts clean and the widget
    // forgets the shopper's identity.
    setTimeout(() => {
      window.location.href = '/';
    }, 400);
    void refresh;
  };

  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 p-2" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Hesabım">
        <User size={21} strokeWidth={1.6} />
        <span className="hidden text-sm xl:inline">{user ? `Merhaba, ${user.firstName}` : 'Giriş Yap'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-line bg-white p-2 shadow-pop animate-fade-in">
          {user ? (
            <>
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                <p className="text-2xs text-ink-muted">{user.loyaltyPoints} Ardisa Puan</p>
              </div>
              {[
                ['/account', 'Hesabım'],
                ['/account/siparislerim', 'Siparişlerim'],
                ['/account/favorilerim', 'Favorilerim'],
                ['/account/adreslerim', 'Adreslerim'],
                ['/account/kuponlarim', 'Kuponlarım'],
              ].map(([href, label]) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-sand">
                  {label}
                </Link>
              ))}
              <button onClick={logout} className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-muted hover:bg-sand">
                Çıkış Yap
              </button>
            </>
          ) : (
            <div className="space-y-2 p-2">
              <Link href="/login" onClick={() => setOpen(false)} className="btn-primary btn-sm w-full">
                Giriş Yap
              </Link>
              <Link href="/register" onClick={() => setOpen(false)} className="btn-outline btn-sm w-full">
                Üye Ol
              </Link>
              <p className="pt-1 text-center text-2xs text-ink-muted">Üyelere özel %10 hoş geldin indirimi</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobileMenu({ menu, onClose, signedIn }: { menu: MenuCategory[]; onClose: () => void; signedIn: boolean }) {
  const [sub, setSub] = useState<MenuCategory | null>(null);
  const router = useRouter();
  const [q, setQ] = useState('');
  // Portalled for the same reason as MiniCart: the header's backdrop-filter
  // would otherwise clip this `fixed` overlay to the header box.
  return createPortal(
    <div className="fixed inset-0 z-drawer bg-ink/40 lg:hidden" onClick={onClose}>
      <div className="h-full w-[86%] max-w-sm overflow-y-auto bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-16 items-center justify-between border-b border-line px-4">
          <Logo className="text-2xl" />
          <button onClick={onClose} aria-label="Kapat" className="p-2">
            <X size={20} />
          </button>
        </div>
        <form
          className="border-b border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) {
              onClose();
              router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara" className="input h-11" id="mobile-search" />
        </form>
        {sub ? (
          <div className="p-2">
            <button onClick={() => setSub(null)} className="px-3 py-3 text-sm text-ink-muted">← Geri</button>
            <Link href={`/c/${sub.slug}`} onClick={onClose} className="block px-3 py-3 text-base font-semibold">Tüm {sub.name}</Link>
            {sub.children.map((c) => (
              <Link key={c.slug} href={`/c/${c.slug}`} onClick={onClose} className="block px-3 py-3 text-base">
                {c.name}
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-2">
            {menu.map((c) => (
              <button key={c.slug} onClick={() => setSub(c)} className="flex w-full items-center justify-between px-3 py-3 text-base">
                {c.name} <ChevronRight size={18} className="text-ink-muted" />
              </button>
            ))}
            <Link href="/c/indirim" onClick={onClose} className="block px-3 py-3 text-base font-semibold text-sale">İndirim</Link>
            <div className="my-2 border-t border-line" />
            <Link href={signedIn ? '/account' : '/login'} onClick={onClose} className="block px-3 py-3 text-sm">{signedIn ? 'Hesabım' : 'Giriş Yap / Üye Ol'}</Link>
            <Link href="/account/favorilerim" onClick={onClose} className="block px-3 py-3 text-sm">Favorilerim</Link>
            <Link href="/siparis-takip" onClick={onClose} className="block px-3 py-3 text-sm">Sipariş Takibi</Link>
            <Link href="/magazalar" onClick={onClose} className="block px-3 py-3 text-sm">Mağazalar</Link>
            <Link href="/yardim" onClick={onClose} className="block px-3 py-3 text-sm">Yardım</Link>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
