'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Bug, ExternalLink, FlaskConical, Mail, Package, PackageCheck, RefreshCw, Send, Store, Tag, UserX, Webhook } from 'lucide-react';
import { formatDate, formatPrice } from '@/lib/format';
import { useStore } from '@/components/Providers';
import type { OrderStatus } from '@/lib/store/order-status';
import { Badge, Empty, Panel, post } from './panel-ui';
import { OrdersTab } from './OrdersTab';
import { MailTab } from './MailTab';

export interface PanelOrder {
  id: number;
  number: string;
  email: string;
  total: number;
  paymentMethod: string;
  status: OrderStatus;
  statusLabel: string;
  createdAt: string;
  itemCount: number;
  firstItem: string;
  trackingNo: string | null;
  /** Who a status event is addressed to: the signed-in member, the browser that placed it, or nobody. */
  owner: 'member' | 'visitor' | 'none';
  marketingEmail: boolean;
  log: Array<{ from: string | null; to: string; eventKey: string | null; eventResult: string | null; at: string }>;
}

export interface PanelData {
  selwise: {
    siteKey: string;
    apiUrl: string;
    widgetUrl: string;
    dashboardUrl: string;
    ssrConfigured: boolean;
    businessEventsConfigured: boolean;
    feedUrl: string;
  };
  products: Array<{ code: string; title: string; price: number; listPrice: number; stock: number; category: string; slug: string }>;
  overrides: Array<{ code: string; price: number | null; listPrice: number | null; hasStock: boolean; updatedAt: string }>;
  coupons: Array<{ code: string; kind: string; value: number; min_total: number; description: string; active: number }>;
  stats: { users: number; orders: number; revenue: number; carts: number; stockAlerts: number };
  orders: PanelOrder[];
  stockAlerts: Array<{ email: string; code: string; size: string | null; created_at: string }>;
  webhooks: Array<{ id: number; event: string | null; signature_ok: number | null; body: string; received_at: string }>;
  /** The local mail provider's inbox; null where there is none (production sends through the merchant's own). */
  mail: { inboxUrl: string; messages: Array<{ id: number; at: string; to: string; subject: string }> } | null;
}

type TabKey = 'orders' | 'mail' | 'events' | 'catalog' | 'coupons' | 'selwise';

export function PanelClient({ data }: { data: PanelData }) {
  const [tab, setTab] = useState<TabKey>('orders');

  const tabs = useMemo(() => {
    const awaiting = data.orders.filter((o) => o.status === 'awaiting_payment').length;
    const list: Array<{ key: TabKey; label: string; icon: typeof Package; badge?: string | number }> = [
      { key: 'orders', label: 'Siparişler', icon: PackageCheck, badge: awaiting || undefined },
      ...(data.mail ? [{ key: 'mail' as const, label: 'E-postalar', icon: Mail, badge: data.mail.messages.length || undefined }] : []),
      { key: 'events', label: 'Olaylar', icon: Webhook, badge: data.webhooks.length || undefined },
      { key: 'catalog', label: 'Katalog', icon: Package },
      { key: 'coupons', label: 'Kuponlar', icon: Tag },
      { key: 'selwise', label: 'Selwise bağlantısı', icon: Activity },
    ];
    return list;
  }, [data.orders, data.mail, data.webhooks.length]);

  // The tab lives in the address, so a refresh (and a link from the orders tab) lands where you were.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace('#', '') as TabKey;
      if (tabs.some((t) => t.key === h)) setTab(h);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [tabs]);

  const go = (key: TabKey) => {
    setTab(key);
    window.history.replaceState(null, '', `#${key}`);
  };

  const stats: Array<[string, string | number]> = [
    ['Üye', data.stats.users],
    ['Sipariş', data.stats.orders],
    ['Ciro', formatPrice(data.stats.revenue)],
    ['Dolu sepet', data.stats.carts],
    ['Stok alarmı', data.stats.stockAlerts],
  ];

  return (
    <div className="min-h-screen bg-sand/60" id="demo-panel">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1360px] items-center gap-4 px-4 md:px-6">
          <Link href="/" className="font-display text-xl leading-none">
            ardisa<span className="text-accent">.</span>
          </Link>
          <span className="hidden h-5 w-px bg-line-strong sm:block" />
          <p className="hidden text-sm text-ink-soft sm:block">Test paneli</p>
          <Badge tone="accent">Selwise test ortamı</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="btn-ghost btn-sm">
              <Store size={14} /> Mağaza
            </Link>
            <a href={data.selwise.dashboardUrl} target="_blank" rel="noreferrer" className="btn-outline btn-sm">
              Selwise paneli <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1360px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Panel bölümleri" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col lg:overflow-visible">
            {tabs.map((t) => {
              const Icon = t.icon;
              const on = tab === t.key;
              return (
                <li key={t.key} className="shrink-0">
                  <button
                    onClick={() => go(t.key)}
                    aria-current={on ? 'page' : undefined}
                    id={`tab-${t.key}`}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${on ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-white hover:text-ink'}`}
                  >
                    <Icon size={16} className={on ? 'text-paper' : 'text-ink-muted'} />
                    <span className="whitespace-nowrap">{t.label}</span>
                    {t.badge !== undefined && (
                      <span className={`ml-auto rounded-full px-1.5 text-[10px] font-semibold leading-4 ${on ? 'bg-paper/20 text-paper' : 'bg-sand-deep text-ink-soft'}`}>{t.badge}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-white px-4 py-3">
                <dt className="text-2xs uppercase tracking-label text-ink-muted">{k}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          {tab === 'orders' && <OrdersTab orders={data.orders} eventsConfigured={data.selwise.businessEventsConfigured} mailInbox={data.mail?.inboxUrl ?? null} />}
          {tab === 'mail' && data.mail && <MailTab mail={data.mail} />}
          {tab === 'events' && <EventsTab data={data} />}
          {tab === 'catalog' && <CatalogTab data={data} />}
          {tab === 'coupons' && <CouponsTab data={data} />}
          {tab === 'selwise' && <SelwiseTab data={data} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selwise connection + data layer
// ---------------------------------------------------------------------------

function SelwiseTab({ data }: { data: PanelData }) {
  const [live, setLive] = useState<Record<string, string>>({});
  const [layer, setLayer] = useState<unknown[]>([]);

  useEffect(() => {
    const read = () => {
      const s = window.Selwise as (Record<string, unknown> & { getVisitorId?: () => string; getSessionId?: () => string; getJourneyId?: () => string; getSiteUserId?: () => string | null; getConsentState?: () => unknown }) | undefined;
      const loaded = !!s && typeof s.getVisitorId === 'function';
      let consent = '—';
      try {
        consent = loaded && s!.getConsentState ? JSON.stringify(s!.getConsentState()) : '—';
      } catch {
        /* ignore */
      }
      setLive({
        loaded: loaded ? 'Yüklendi' : data.selwise.siteKey ? 'Yüklenmedi (engelleyici? alan adı doğrulanmadı mı?)' : 'Site anahtarı yok',
        visitor: loaded ? s!.getVisitorId!() : '—',
        session: loaded && s!.getSessionId ? s!.getSessionId() : '—',
        journey: loaded && s!.getJourneyId ? String(s!.getJourneyId()) : '—',
        user: loaded && s!.getSiteUserId ? String(s!.getSiteUserId() || 'anonim') : '—',
        consent,
        debug: localStorage.getItem('selwise_debug') === 'true' ? 'açık' : 'kapalı',
        testMode: localStorage.getItem('selwise_test_mode') === 'true' ? 'açık' : 'kapalı',
      });
      setLayer([...(window.selwiseLayer || [])].slice(-15).reverse());
    };
    read();
    const t = setInterval(read, 2000);
    return () => clearInterval(t);
  }, [data.selwise.siteKey]);

  const toggleLs = (k: string) => {
    const on = localStorage.getItem(k) === 'true';
    if (on) localStorage.removeItem(k);
    else localStorage.setItem(k, 'true');
    window.location.reload();
  };

  const resetIdentity = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    for (const k of Object.keys(localStorage)) if (k.startsWith('selwise') || k.startsWith('ardisa')) localStorage.removeItem(k);
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('selwise') || k.startsWith('ardisa')) sessionStorage.removeItem(k);
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      if (name.startsWith('selwise') || name.startsWith('_sw')) document.cookie = `${name}=; Max-Age=0; path=/`;
    });
    window.location.href = '/';
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Selwise bağlantısı" id="panel-selwise">
        <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-xs">
          <dt className="text-ink-muted">Site anahtarı</dt>
          <dd className="font-mono">{data.selwise.siteKey || '— (SELWISE_SITE_KEY tanımlı değil)'}</dd>
          <dt className="text-ink-muted">Widget</dt>
          <dd>{live.loaded}</dd>
          <dt className="text-ink-muted">Ziyaretçi</dt>
          <dd className="break-all font-mono">{live.visitor}</dd>
          <dt className="text-ink-muted">Oturum</dt>
          <dd className="break-all font-mono">{live.session}</dd>
          <dt className="text-ink-muted">Yolculuk</dt>
          <dd className="break-all font-mono">{live.journey}</dd>
          <dt className="text-ink-muted">Kullanıcı</dt>
          <dd className="font-mono">{live.user}</dd>
          <dt className="text-ink-muted">Çerez izni</dt>
          <dd className="break-all font-mono">{live.consent}</dd>
          <dt className="text-ink-muted">SSR zenginleştirme</dt>
          <dd>{data.selwise.ssrConfigured ? 'Açık (SELWISE_SSR_API_KEY)' : 'Kapalı — yalnızca tarayıcıda'}</dd>
          <dt className="text-ink-muted">İş olayları</dt>
          <dd>{data.selwise.businessEventsConfigured ? 'Açık (SELWISE_SERVER_API_KEY)' : 'Kapalı — sipariş durumu olay göndermez'}</dd>
          <dt className="text-ink-muted">Ürün beslemesi</dt>
          <dd>
            <a className="link break-all" href={data.selwise.feedUrl} target="_blank" rel="noreferrer">
              {data.selwise.feedUrl}
            </a>
          </dd>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" onClick={() => toggleLs('selwise_debug')}>
            <Bug size={14} /> Debug: {live.debug}
          </button>
          <button className="btn-outline btn-sm" onClick={() => toggleLs('selwise_test_mode')}>
            <FlaskConical size={14} /> Test modu: {live.testMode}
          </button>
          <button className="btn-outline btn-sm" onClick={resetIdentity} id="panel-reset-identity">
            <UserX size={14} /> Yeni ziyaretçi olarak başla
          </button>
        </div>
        <p className="mt-3 text-2xs text-ink-muted">
          Test modu yalnızca “test modunda” kampanya ve senaryoları gösterir. “Yeni ziyaretçi” çıkış yapar ve Selwise kimliğini sıfırlar.
        </p>
      </Panel>

      <Panel title="Veri katmanı (selwiseLayer)" hint="Bu sekmede widget'ın gördüğü son olaylar." id="panel-layer">
        {layer.length === 0 ? (
          <Empty>Bu sayfada henüz bir olay yok. Mağazada ürün ekleyin, giriş yapın ya da gezinin.</Empty>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {layer.map((e, i) => (
              <li key={i} className="rounded-lg bg-sand p-2 font-mono text-[11px] leading-snug">
                {JSON.stringify(e).slice(0, 400)}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Business events + incoming webhooks
// ---------------------------------------------------------------------------

function EventsTab({ data }: { data: PanelData }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <BusinessEventCard configured={data.selwise.businessEventsConfigured} />
      <Panel
        title="Gelen webhook'lar"
        hint={
          <>
            Mağazanın arka ofisi Selwise webhook&apos;larını <code className="font-mono">/api/webhooks/selwise</code> adresinde alır (Entegrasyonlar → Webhook&apos;lar ve senaryo “aktarım” adımları).
          </>
        }
        id="panel-webhooks"
      >
        {data.webhooks.length === 0 ? (
          <Empty>Henüz teslimat yok.</Empty>
        ) : (
          <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
            {data.webhooks.map((w) => (
              <li key={w.id} className="rounded-lg bg-sand p-3 text-[11px]">
                <p className="flex flex-wrap justify-between gap-1 font-semibold">
                  <span>{w.event || 'olay'}</span>
                  <span className="font-normal text-ink-muted">
                    {w.signature_ok === null ? 'imza kontrol edilmedi' : w.signature_ok ? 'imza doğru' : 'imza HATALI'} · {formatDate(w.received_at, true)}
                  </span>
                </p>
                <p className="mt-1 break-all font-mono text-ink-soft">{w.body.slice(0, 280)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function BusinessEventCard({ configured }: { configured: boolean }) {
  const { user, toast } = useStore();
  const [key, setKey] = useState('order_delivered');
  const [payload, setPayload] = useState('{"orderNumber":"ARD000000","carrier":"Ardisa Kargo"}');
  const [result, setResult] = useState<string | null>(null);
  return (
    <Panel
      title="İş olayı gönder"
      hint={
        <>
          Mağazanın arka ofisinin Selwise&apos;a sunucudan gönderdiği olay. <em>İş olayı</em> ile başlayan senaryoları tetikler. Siparişlerin durumu değişince bu olay otomatik gider; burada elle de deneyebilirsiniz.
        </>
      }
      id="panel-business-event"
    >
      {!configured && <p className="mb-3 rounded-lg bg-warn/10 p-3 text-xs text-warn">SELWISE_SERVER_API_KEY tanımlı değil; gönderim kapalı.</p>}
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const visitorId = (window.Selwise as { getVisitorId?: () => string } | undefined)?.getVisitorId?.();
            const r = await post<{ status: number; body: string }>('/api/demo/business-event', {
              key,
              ...(user ? { siteUserId: user.selwiseId } : visitorId ? { visitorId } : {}),
              payload: JSON.parse(payload || '{}'),
            });
            setResult(`${r.status} ${r.body}`);
          } catch (err) {
            toast((err as Error).message, 'error');
          }
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {['order_shipped', 'order_delivered', 'order_cancelled'].map((k) => (
            <button type="button" key={k} onClick={() => setKey(k)} className={`h-7 rounded-full border px-2.5 font-mono text-[11px] ${key === k ? 'border-ink bg-ink text-paper' : 'border-line-strong text-ink-soft hover:border-ink'}`}>
              {k}
            </button>
          ))}
        </div>
        <input value={key} onChange={(e) => setKey(e.target.value)} className="input h-10 font-mono" placeholder="olay anahtarı" />
        <textarea value={payload} onChange={(e) => setPayload(e.target.value)} className="input h-24 py-2 font-mono text-xs" />
        <button className="btn-primary btn-sm" disabled={!configured}>
          <Send size={13} /> Gönder ({user ? `kullanıcı ${user.selwiseId}` : 'bu tarayıcı'})
        </button>
      </form>
      {result && <pre className="mt-3 overflow-x-auto rounded-lg bg-sand p-3 text-[11px]">{result}</pre>}
      <p className="mt-3 text-2xs text-ink-muted">Olay, giriş yaptıysanız kullanıcınıza; yapmadıysanız bu tarayıcının ziyaretçi kimliğine gider.</p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

function CatalogTab({ data }: { data: PanelData }) {
  const router = useRouter();
  const { toast, quickAdd } = useStore();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string>(data.products[0]?.code || '');
  const [pct, setPct] = useState(20);

  const products = useMemo(
    () => data.products.filter((p) => !filter || `${p.code} ${p.title} ${p.category}`.toLocaleLowerCase('tr').includes(filter.toLocaleLowerCase('tr'))).slice(0, 60),
    [data.products, filter],
  );
  const current = data.products.find((p) => p.code === selected);

  const act = async (body: Record<string, unknown>, ok: string) => {
    try {
      await post('/api/demo/override', body);
      toast(ok);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Panel
      title="Katalog olayları"
      hint={
        <>
          Selwise değişikliği bir sonraki <strong>feed senkronunda</strong> görür. Hemen tetiklemek için Selwise panelinde <em>Kanallar → Ürün Beslemesi → Şimdi senkronize et</em>. Fiyat düşüşü senaryosu, ürünü daha önce
          görüntülemiş/sepete eklemiş ziyaretçileri hedefler.
        </>
      }
      id="panel-catalog"
    >
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Ürün ara (kod, ad, kategori)" className="input h-10" />
      <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input mt-2 h-auto py-1" size={7}>
        {products.map((p) => (
          <option key={p.code} value={p.code}>
            {p.code} · {p.title} · {formatPrice(p.price)} · stok {p.stock}
          </option>
        ))}
      </select>
      {current && (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            <Link href={`/p/${current.slug}`} className="link font-medium">
              {current.title}
            </Link>{' '}
            — {formatPrice(current.price)}
            {current.listPrice > current.price && <span className="ml-1 text-ink-faint line-through">{formatPrice(current.listPrice)}</span>} · stok {current.stock}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min={1} max={90} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="input h-9 w-20" />
            <button className="btn-primary btn-sm" onClick={() => act({ action: 'price_drop', code: current.code, percent: pct }, `Fiyat %${pct} düşürüldü.`)} id="panel-price-drop">
              Fiyatı düşür
            </button>
            <button className="btn-outline btn-sm" onClick={() => act({ action: 'sell_out', code: current.code }, 'Ürün tükendi olarak işaretlendi.')} id="panel-sell-out">
              Stoğu bitir
            </button>
            <button className="btn-outline btn-sm" onClick={() => act({ action: 'low_stock', code: current.code, units: 2 }, 'Stok 2 adede düşürüldü.')}>
              Stok: 2 adet
            </button>
            <button className="btn-outline btn-sm" onClick={() => act({ action: 'restock', code: current.code }, 'Ürün stoğa girdi.')} id="panel-restock">
              Stoğa al
            </button>
            <button className="btn-ghost btn-sm" onClick={() => act({ action: 'reset', code: current.code }, 'Ürün varsayılana döndü.')}>
              <RefreshCw size={13} /> Sıfırla
            </button>
            <button className="btn-ghost btn-sm" onClick={() => quickAdd(current.code)}>
              Sepete ekle
            </button>
          </div>
        </div>
      )}
      {data.overrides.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Değiştirilmiş ürünler ({data.overrides.length})</p>
            <button className="text-xs underline" onClick={() => act({ action: 'reset' }, 'Tüm değişiklikler sıfırlandı.')}>
              Hepsini sıfırla
            </button>
          </div>
          <ul className="mt-2 divide-y divide-line text-xs">
            {data.overrides.map((o) => (
              <li key={o.code} className="flex justify-between py-2">
                <span className="font-mono">{o.code}</span>
                <span className="text-ink-muted">
                  {o.price !== null ? `fiyat ${formatPrice(o.price)}` : ''} {o.hasStock ? '· stok değişti' : ''} · {formatDate(o.updatedAt, true)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Coupons + stock alerts
// ---------------------------------------------------------------------------

function CouponsTab({ data }: { data: PanelData }) {
  const router = useRouter();
  const { toast } = useStore();
  const [c, setC] = useState({ code: '', kind: 'percent', value: 15, minTotal: 0, description: '' });
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Kuponlar" hint="Selwise kampanyalarında gösterdiğiniz kodu burada tanımlayın; sepette çalışsın." id="panel-coupons">
        <ul className="divide-y divide-line text-xs">
          {data.coupons.map((k) => (
            <li key={k.code} className="flex items-center justify-between gap-3 py-2">
              <span className="font-mono font-semibold">{k.code}</span>
              <span className="text-right text-ink-muted">
                {k.description}
                {k.min_total ? ` · min ${formatPrice(k.min_total)}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post('/api/demo/coupons', { ...c, code: c.code.toUpperCase(), active: true, description: c.description || `${c.code} kampanyası` });
              toast('Kupon kaydedildi.');
              router.refresh();
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        >
          <input required value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} placeholder="KOD" className="input h-9 sm:col-span-2" />
          <select value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value })} className="input h-9">
            <option value="percent">%</option>
            <option value="amount">TL</option>
            <option value="shipping">Kargo</option>
          </select>
          <input type="number" value={c.value} onChange={(e) => setC({ ...c, value: Number(e.target.value) })} className="input h-9" />
          <input type="number" value={c.minTotal} onChange={(e) => setC({ ...c, minTotal: Number(e.target.value) })} placeholder="Min" className="input h-9" />
          <button className="btn-primary btn-sm h-9">Ekle</button>
        </form>
      </Panel>

      <Panel title="Stok alarmı kayıtları" hint="“Gelince haber ver” diyen alıcılar." id="panel-stock-alerts">
        {data.stockAlerts.length === 0 ? (
          <Empty>Kayıt yok.</Empty>
        ) : (
          <ul className="divide-y divide-line text-xs">
            {data.stockAlerts.map((a, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>{a.email}</span>
                <span className="font-mono text-ink-muted">
                  {a.code}
                  {a.size ? ` / ${a.size}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
