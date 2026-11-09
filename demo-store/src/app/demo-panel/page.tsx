import type { Metadata } from 'next';
import { panelAllowed } from '@/lib/store/panel-auth';
import { listOverrides, liveProducts } from '@/lib/store/products';
import { db } from '@/lib/store/db';
import { selwiseConfig } from '@/lib/selwise/config';
import { statusLog, toView, type OrderRow } from '@/lib/store/orders';
import { PanelClient, type PanelData } from './PanelClient';

export const metadata: Metadata = { title: 'Test Paneli' };

/** How many orders the panel lists: the newest ones are the ones someone is trying. */
const ORDER_LIMIT = 60;

/**
 * The e-mail provider a local run sends through: a local SMTP catcher with an HTTP inbox.
 * In production the merchant's real provider sends, so there is no inbox here:
 * unset in production, defaulted for local development.
 */
async function readMailSink(): Promise<PanelData['mail']> {
  const base = process.env.DEMO_MAIL_SINK_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:8025');
  if (!base) return null;
  try {
    const res = await fetch(`${base}/messages`, { cache: 'no-store', signal: AbortSignal.timeout(1200) });
    if (!res.ok) return null;
    const body = (await res.json()) as { messages: Array<{ id: number; at: string; to: string; subject: string }> };
    return {
      inboxUrl: base.replace('127.0.0.1', 'localhost'),
      messages: body.messages.slice(0, 20).map((m) => ({ id: m.id, at: m.at, to: m.to, subject: m.subject })),
    };
  } catch {
    return null;
  }
}

export default async function DemoPanelPage({ searchParams }: { searchParams: { error?: string } }) {
  if (!panelAllowed()) {
    return (
      <div className="container max-w-md py-24">
        <p className="eyebrow">Selwise test ortamı</p>
        <h1 className="mt-1 font-display text-4xl">Test Paneli</h1>
        <p className="mt-2 text-sm text-ink-soft">Bu panel katalog fiyatlarını, stokları ve siparişleri değiştirir. Devam etmek için panel anahtarını girin.</p>
        <form action="/api/demo/unlock" method="post" className="mt-6 flex gap-2">
          <input name="key" type="password" className="input" placeholder="Panel anahtarı" required />
          <button className="btn-primary shrink-0">Aç</button>
        </form>
        {searchParams.error && <p className="mt-3 text-sm text-sale">Anahtar hatalı.</p>}
      </div>
    );
  }

  const cfg = selwiseConfig();
  const products = liveProducts();
  const d = db();
  const orderRows = d.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT ?').all(ORDER_LIMIT) as OrderRow[];
  const data: PanelData = {
    selwise: {
      siteKey: cfg.siteKey,
      apiUrl: cfg.apiUrl,
      widgetUrl: cfg.widgetUrl,
      dashboardUrl: cfg.dashboardUrl,
      ssrConfigured: !!cfg.ssrKey,
      businessEventsConfigured: !!process.env.SELWISE_SERVER_API_KEY,
      feedUrl: `${cfg.publicUrl}/feeds/google.xml`,
    },
    products: products.map((p) => ({
      code: p.code,
      title: p.title,
      price: p.price,
      listPrice: p.listPrice,
      stock: p.sizes.reduce((s, x) => s + x.stock, 0),
      category: p.categoryPath.join(' > '),
      slug: p.slug,
    })),
    overrides: listOverrides().map((o) => ({ code: o.code, price: o.price, listPrice: o.list_price, hasStock: !!o.stock, updatedAt: o.updated_at })),
    coupons: d.prepare('SELECT code, kind, value, min_total, description, active FROM coupons ORDER BY created_at').all() as PanelData['coupons'],
    stats: {
      users: (d.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n,
      orders: (d.prepare('SELECT COUNT(*) n FROM orders').get() as { n: number }).n,
      revenue: (d.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status NOT IN ('cancelled','returned')").get() as { s: number }).s,
      carts: (d.prepare('SELECT COUNT(DISTINCT cart_id) n FROM cart_items').get() as { n: number }).n,
      stockAlerts: (d.prepare('SELECT COUNT(*) n FROM stock_alerts').get() as { n: number }).n,
    },
    orders: orderRows.map((row) => {
      const v = toView(row);
      return {
        id: v.id,
        number: v.number,
        email: v.email,
        total: v.total,
        paymentMethod: v.paymentMethod,
        status: v.status,
        statusLabel: v.statusLabel,
        createdAt: v.createdAt,
        itemCount: v.lines.reduce((n, l) => n + l.qty, 0),
        firstItem: v.lines[0]?.title ?? '',
        trackingNo: v.trackingNo,
        owner: row.user_id ? 'member' : row.visitor_id ? 'visitor' : 'none',
        marketingEmail: !!row.marketing_email,
        log: statusLog(v.id).map((l) => ({ from: l.from_status, to: l.to_status, eventKey: l.event_key, eventResult: l.event_result, at: l.created_at })),
      };
    }),
    stockAlerts: d.prepare('SELECT email, code, size, created_at FROM stock_alerts ORDER BY created_at DESC LIMIT 20').all() as PanelData['stockAlerts'],
    webhooks: d
      .prepare('SELECT id, event, signature_ok, body, received_at FROM webhook_deliveries ORDER BY id DESC LIMIT 15')
      .all() as PanelData['webhooks'],
    mail: await readMailSink(),
  };
  return <PanelClient data={data} />;
}
