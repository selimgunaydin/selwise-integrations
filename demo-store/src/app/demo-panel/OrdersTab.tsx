'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ChevronDown, Mail, Search } from 'lucide-react';
import { formatDate, formatPrice } from '@/lib/format';
import { useStore } from '@/components/Providers';
import { nextStatus, ORDER_FLOW, orderEventKey, STATUS_LABELS, type OrderStatus } from '@/lib/store/order-status';
import { Badge, Empty, Panel, post } from './panel-ui';
import type { PanelOrder } from './PanelClient';

const PAYMENT: Record<string, string> = { card: 'Kart', transfer: 'Havale', cod: 'Kapıda' };

const STATUS_TONE: Record<OrderStatus, 'neutral' | 'ok' | 'warn' | 'bad' | 'accent'> = {
  awaiting_payment: 'warn',
  received: 'neutral',
  preparing: 'accent',
  shipped: 'accent',
  delivered: 'ok',
  cancelled: 'bad',
  return_requested: 'warn',
  returned: 'bad',
};

interface EventResult {
  key: string;
  sent: boolean;
  accepted: boolean;
  scenarios: number;
  note: string;
}

/** The happy path as five stops, the current one filled. Off-path states (cancelled, returned) draw none. */
function Stepper({ status }: { status: OrderStatus }) {
  const at = ORDER_FLOW.indexOf(status);
  if (at < 0) return <p className="text-xs text-ink-muted">{STATUS_LABELS[status]} — akış dışı</p>;
  return (
    <ol className="flex items-start" aria-label="Sipariş aşamaları">
      {ORDER_FLOW.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col items-center last:flex-none" style={{ minWidth: 0 }}>
          <div className="flex w-full items-center">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${
                i < at ? 'border-ok bg-ok text-white' : i === at ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-white text-transparent'
              }`}
            >
              {i < at ? <Check size={11} strokeWidth={3} /> : i === at ? i + 1 : ''}
            </span>
            {i < ORDER_FLOW.length - 1 && <span className={`h-px flex-1 ${i < at ? 'bg-ok' : 'bg-line-strong'}`} />}
          </div>
          <span className={`mt-1.5 hidden w-full pr-1 text-[10px] leading-tight sm:block ${i === at ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{STATUS_LABELS[s]}</span>
        </li>
      ))}
    </ol>
  );
}

function OrderRow({
  order,
  notify,
  busy,
  open,
  onToggle,
  onMove,
}: {
  order: PanelOrder;
  notify: boolean;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onMove: (to: OrderStatus | 'next') => void;
}) {
  const next = nextStatus(order.status);
  const unaddressable = notify && order.owner === 'none';
  return (
    <li className="py-4 first:pt-0 last:pb-0" data-order={order.number}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-semibold">{order.number}</span>
        <Badge tone={STATUS_TONE[order.status]}>{order.statusLabel}</Badge>
        {order.owner === 'member' && <Badge title="Üye siparişi: olay üyenin kimliğine gider">Üye</Badge>}
        {order.owner === 'visitor' && <Badge title="Misafir siparişi: olay siparişi veren tarayıcının ziyaretçi kimliğine gider">Misafir · ziyaretçi</Badge>}
        {order.owner === 'none' && <Badge tone="warn" title="Sahibi bilinmiyor: durum değişir ama Selwise'a olay gidemez">Sahibi yok</Badge>}
        {order.marketingEmail && (
          <Badge tone="ok" title="Siparişte e-posta izni işaretlendi">
            <Mail size={11} /> E-posta izni
          </Badge>
        )}
        <span className="ml-auto text-xs text-ink-muted">{formatDate(order.createdAt, true)}</span>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {order.email} · {order.itemCount} ürün{order.firstItem ? ` (${order.firstItem}${order.itemCount > 1 ? '…' : ''})` : ''} · <strong className="font-semibold">{formatPrice(order.total)}</strong> ·{' '}
        {PAYMENT[order.paymentMethod] || order.paymentMethod}
        {order.trackingNo ? ` · takip ${order.trackingNo}` : ''}
      </p>

      <div className="mt-3 max-w-xl">
        <Stepper status={order.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {next ? (
          <button
            className="btn-primary btn-sm"
            disabled={busy}
            onClick={() => onMove('next')}
            title={notify ? `Selwise'a ${orderEventKey(next)} olayı gider` : 'Yalnızca durum değişir'}
            data-advance={order.number}
          >
            İlerlet: {STATUS_LABELS[next]} <ArrowRight size={13} />
          </button>
        ) : (
          <span className="text-xs text-ink-muted">Akışın sonu.</span>
        )}
        <label className="sr-only" htmlFor={`st-${order.id}`}>
          Durumu seç
        </label>
        <select
          id={`st-${order.id}`}
          className="h-9 rounded-full border border-line-strong bg-white px-3 text-xs text-ink-soft hover:border-ink"
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && onMove(e.target.value as OrderStatus)}
        >
          <option value="">Duruma git…</option>
          {(Object.keys(STATUS_LABELS) as OrderStatus[])
            .filter((s) => s !== order.status)
            .map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
        </select>
        <button className="ml-auto inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink" onClick={onToggle} aria-expanded={open}>
          Geçmiş ({order.log.length}) <ChevronDown size={13} className={open ? 'rotate-180' : ''} />
        </button>
      </div>
      {unaddressable && <p className="mt-2 text-[11px] text-warn">Bu siparişin sahibi bilinmiyor; durum değişecek ama Selwise&apos;a olay gitmeyecek.</p>}

      {open && (
        <ol className="mt-3 space-y-2 border-l border-line pl-4 text-xs">
          {order.log.length === 0 && <li className="text-ink-muted">Kayıt yok.</li>}
          {[...order.log].reverse().map((l, i) => (
            <li key={i}>
              <p>
                <span className="font-medium">
                  {l.from ? `${STATUS_LABELS[l.from as OrderStatus] || l.from} → ` : ''}
                  {STATUS_LABELS[l.to as OrderStatus] || l.to}
                </span>{' '}
                <span className="text-ink-muted">· {formatDate(l.at, true)}</span>
              </p>
              {l.eventKey && (
                <p className="mt-0.5 text-ink-soft">
                  <code className="rounded bg-sand px-1 py-0.5 font-mono text-[11px]">{l.eventKey}</code> → {l.eventResult}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export function OrdersTab({ orders, eventsConfigured, mailInbox }: { orders: PanelOrder[]; eventsConfigured: boolean; mailInbox: string | null }) {
  const router = useRouter();
  const { toast } = useStore();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [notify, setNotify] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [lastEvent, setLastEvent] = useState<{ number: string; to: string; event: EventResult | null } | null>(null);

  const counts = useMemo(() => {
    const c: Partial<Record<OrderStatus, number>> = {};
    for (const o of orders) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return orders.filter((o) => (statusFilter === 'all' || o.status === statusFilter) && (!q || `${o.number} ${o.email}`.toLocaleLowerCase('tr').includes(q)));
  }, [orders, query, statusFilter]);

  const move = async (o: PanelOrder, to: OrderStatus | 'next') => {
    setBusyId(o.id);
    try {
      const res = await post<{ order: { number: string; statusLabel: string; status: OrderStatus }; event: EventResult | null }>('/api/demo/orders', {
        id: o.id,
        ...(to === 'next' ? { action: 'advance' } : { action: 'set_status', status: to }),
        notify: notify && eventsConfigured,
      });
      setLastEvent({ number: res.order.number, to: res.order.statusLabel, event: res.event });
      setOpenIds((s) => new Set(s).add(o.id));
      toast(`${res.order.number} → ${res.order.statusLabel}${res.event ? ` · ${res.event.note}` : ''}`, res.event && !res.event.accepted ? 'error' : 'ok');
      router.refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const chips: Array<[OrderStatus | 'all', string]> = [
    ['all', 'Tümü'],
    ...(['awaiting_payment', 'received', 'preparing', 'shipped', 'delivered', 'cancelled'] as OrderStatus[]).map((s): [OrderStatus, string] => [s, STATUS_LABELS[s]]),
  ];

  return (
    <div className="space-y-5">
      <Panel
        title="Senaryoyu denemek için"
        hint={
          <>
            Bir siparişin durumunu ilerlettiğinizde mağazanın arka ofisi Selwise&apos;a <code className="font-mono">order_&lt;durum&gt;</code> iş olayını gönderir (örn.{' '}
            <code className="font-mono">order_delivered</code>). Bu olayla başlayan yayındaki senaryo çalışır.
          </>
        }
      >
        <ol className="grid gap-3 text-xs text-ink-soft sm:grid-cols-3">
          <li className="rounded-lg bg-sand p-3">
            <strong className="block text-ink">1 · Sipariş verin</strong>
            Mağazada giriş yapıp ya da misafir olarak sipariş verin; ödeme adımında <em>e-posta ile haberdar et</em> kutusunu işaretleyin (alıcının izni olmadan e-posta gitmez).
          </li>
          <li className="rounded-lg bg-sand p-3">
            <strong className="block text-ink">2 · Durumu ilerletin</strong>
            Aşağıda siparişin yanındaki düğmeyle Hazırlanıyor → Kargoya verildi → <strong>Teslim edildi</strong> aşamalarına geçin.
          </li>
          <li className="rounded-lg bg-sand p-3">
            <strong className="block text-ink">3 · Sonucu izleyin</strong>
            Selwise → Senaryolar&apos;da çalışmayı görün; e-posta{' '}
            {mailInbox ? (
              <a href="#mail" className="link">
                E-postalar
              </a>
            ) : (
              'sağlayıcınızın gelen kutusu'
            )}{' '}
            sekmesine düşer.
          </li>
        </ol>
      </Panel>

      <Panel
        title="Siparişler"
        hint={`Son ${orders.length} sipariş. Bir siparişe dokunulduktan sonra durumu kendiliğinden ilerlemez; dokunulmayanlar yaşına göre kendi kendine ilerler.`}
        action={
          <label className={`flex items-center gap-2 text-xs ${eventsConfigured ? 'text-ink-soft' : 'text-ink-faint'}`} title={eventsConfigured ? '' : 'SELWISE_SERVER_API_KEY tanımlı değil'}>
            <input type="checkbox" className="h-4 w-4 accent-[#1F1D1A]" checked={notify && eventsConfigured} disabled={!eventsConfigured} onChange={(e) => setNotify(e.target.checked)} />
            Durum değişince Selwise&apos;a olay gönder
          </label>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sipariş no ya da e-posta ara" className="input h-9 pl-9 text-xs" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map(([key, label]) => {
              const n = key === 'all' ? orders.length : counts[key] || 0;
              const on = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`h-8 rounded-full border px-3 text-xs transition-colors ${on ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-white text-ink-soft hover:border-ink'}`}
                >
                  {label} <span className={on ? 'text-paper/70' : 'text-ink-faint'}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {lastEvent && (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-xs ${!lastEvent.event ? 'border-line bg-sand text-ink-soft' : lastEvent.event.accepted && lastEvent.event.scenarios > 0 ? 'border-ok/30 bg-ok/10 text-ok' : lastEvent.event.accepted ? 'border-line bg-sand text-ink-soft' : 'border-warn/30 bg-warn/10 text-warn'}`}
            role="status"
            data-last-event
          >
            <strong>{lastEvent.number}</strong> · {lastEvent.to}
            {lastEvent.event ? (
              <>
                {' '}
                — <code className="font-mono">{lastEvent.event.key}</code>: {lastEvent.event.note}
              </>
            ) : (
              ' — Selwise\'a olay gönderilmedi.'
            )}
          </div>
        )}

        <div className="mt-4">
          {visible.length === 0 ? (
            <Empty>{orders.length === 0 ? 'Henüz sipariş yok. Mağazadan bir sipariş verin.' : 'Bu süzgece uyan sipariş yok.'}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  notify={notify && eventsConfigured}
                  busy={busyId === o.id}
                  open={openIds.has(o.id)}
                  onToggle={() =>
                    setOpenIds((s) => {
                      const n = new Set(s);
                      if (n.has(o.id)) n.delete(o.id);
                      else n.add(o.id);
                      return n;
                    })
                  }
                  onMove={(to) => move(o, to)}
                />
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
