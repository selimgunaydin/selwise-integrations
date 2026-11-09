import { formatPrice } from '@/lib/format';

export function Price({ price, listPrice, size = 'md' }: { price: number; listPrice: number; size?: 'sm' | 'md' | 'lg' }) {
  const onSale = listPrice > price;
  const pct = onSale ? Math.round(((listPrice - price) / listPrice) * 100) : 0;
  const main = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-[15px]';
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {onSale && <span className={`${size === 'lg' ? 'text-base' : 'text-xs'} text-ink-faint line-through`}>{formatPrice(listPrice)}</span>}
      <span className={`${main} font-semibold ${onSale ? 'text-sale' : 'text-ink'}`}>{formatPrice(price)}</span>
      {onSale && size === 'lg' && <span className="rounded-full bg-sale/10 px-2 py-0.5 text-xs font-semibold text-sale">%{pct} indirim</span>}
    </div>
  );
}
