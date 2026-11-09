import { Price } from '@/components/product/Price';

/**
 * The store's own card for a product that came from the Selwise API. The API
 * returns DATA (title, price, image, url); the markup is the merchant's.
 * Server-safe: no hooks, so both the SSR strip and the browser strip use it.
 */
export interface HeadlessProduct {
  itemCode: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  brand?: string | null;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** A price in another currency or language than the store's own (lira, Turkish) — the language page. */
function formatForeign(amount: number, currency: string, locale: string) {
  const key = `${locale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
    formatters.set(key, f);
  }
  return f.format(amount);
}

/** A feed URL is absolute (the store's public address); keep the shopper on this host. */
function localHref(url?: string | null) {
  if (!url) return '#';
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export function HeadlessCard({ product, locale = 'tr-TR', onClick }: { product: HeadlessProduct; locale?: string; onClick?: () => void }) {
  const currency = product.currency || 'TRY';
  const listPrice = product.originalPrice ?? product.price;
  return (
    <a href={localHref(product.url)} onClick={onClick} className="group block" data-headless-card={product.itemCode}>
      <div className="aspect-[4/5] overflow-hidden rounded-xl bg-sand">
        {product.imageUrl && <img src={localHref(product.imageUrl)} alt={product.title} loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="mt-2 space-y-0.5">
        {product.brand && <p className="text-2xs uppercase tracking-label text-ink-muted">{product.brand}</p>}
        <p className="line-clamp-1 text-sm text-ink group-hover:underline">{product.title}</p>
        {currency === 'TRY' && locale === 'tr-TR' ? (
          <Price price={product.price} listPrice={listPrice} size="sm" />
        ) : (
          <p className="text-sm font-semibold">{formatForeign(product.price, currency, locale)}</p>
        )}
      </div>
    </a>
  );
}
