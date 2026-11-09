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

export function formatMoney(amount: number, currency = 'TRY', locale = 'tr-TR') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
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
  const onSale = product.originalPrice != null && product.originalPrice > product.price;
  return (
    <a href={localHref(product.url)} onClick={onClick} className="group block" data-headless-card={product.itemCode}>
      <div className="aspect-[4/5] overflow-hidden rounded-xl bg-sand">
        {product.imageUrl && <img src={localHref(product.imageUrl)} alt={product.title} loading="lazy" className="h-full w-full object-cover" />}
      </div>
      <div className="mt-2 space-y-0.5">
        {product.brand && <p className="text-2xs uppercase tracking-label text-ink-muted">{product.brand}</p>}
        <p className="line-clamp-1 text-sm text-ink group-hover:underline">{product.title}</p>
        <p className="text-sm">
          {onSale && <span className="mr-2 text-xs text-ink-faint line-through">{formatMoney(product.originalPrice!, product.currency || 'TRY', locale)}</span>}
          <span className={`font-semibold ${onSale ? 'text-sale' : 'text-ink'}`}>{formatMoney(product.price, product.currency || 'TRY', locale)}</span>
        </p>
      </div>
    </a>
  );
}
