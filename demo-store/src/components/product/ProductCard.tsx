import Link from 'next/link';
import type { Product } from '@/lib/catalog';
import { getSiblings } from '@/lib/catalog';
import { Price } from './Price';
import { Rating } from './Rating';
import { FavoriteButton } from './FavoriteButton';

const total = (p: Product) => p.sizes.reduce((s, x) => s + x.stock, 0);

/**
 * A listing card. It carries `data-ardisa-card`, NOT `data-product-sku` /
 * `data-product-id`: Selwise reads those as "this is a product page" and as
 * THE page's product, so putting them on every card of a listing would make a
 * category page look like the first card's product page.
 */
export function ProductCard({ product, list, position, priority = false }: { product: Product; list: string; position: number; priority?: boolean }) {
  const stock = total(product);
  const siblings = getSiblings(product);
  return (
    <article className="group relative" data-ardisa-card={product.code} data-list={list} data-position={position} data-price={product.price}>
      <Link href={`/p/${product.slug}`} className="block" prefetch={false}>
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-sand">
          <img
            src={`/img/p/${product.code}/1.svg`}
            alt={product.title}
            loading={priority ? 'eager' : 'lazy'}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-0"
          />
          <img src={`/img/p/${product.code}/3.svg`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {product.discountRate > 0 && <span className="rounded-full bg-sale px-2.5 py-1 text-2xs font-semibold text-white">%{product.discountRate}</span>}
            {product.isNew && <span className="rounded-full bg-white px-2.5 py-1 text-2xs font-semibold text-ink">Yeni</span>}
            {product.isBestseller && <span className="rounded-full bg-ink px-2.5 py-1 text-2xs font-semibold text-paper">Çok Satan</span>}
          </div>
          {stock === 0 && (
            <div className="absolute inset-x-3 bottom-3 rounded-lg bg-white/90 py-2 text-center text-xs font-medium text-ink-soft backdrop-blur">Tükendi</div>
          )}
          {stock > 0 && stock <= 3 && (
            <div className="absolute inset-x-3 bottom-3 rounded-lg bg-white/90 py-2 text-center text-xs font-medium text-warn backdrop-blur">Son {stock} ürün</div>
          )}
        </div>
        <div className="mt-3 space-y-1">
          <p lang="en" className="text-2xs uppercase tracking-label text-ink-muted">{product.brand}</p>
          <h3 className="line-clamp-1 text-sm text-ink">{product.title}</h3>
          <Price price={product.price} listPrice={product.listPrice} />
          <Rating value={product.rating} count={product.reviewCount} />
        </div>
      </Link>
      {siblings.length > 1 && (
        <div className="mt-2 flex items-center gap-1.5">
          {siblings.slice(0, 5).map((s) => (
            <Link
              key={s.code}
              href={`/p/${s.slug}`}
              prefetch={false}
              title={s.colorName}
              className={`h-3.5 w-3.5 rounded-full border ${s.code === product.code ? 'ring-1 ring-ink ring-offset-1' : 'border-line-strong'}`}
              style={{ backgroundColor: s.colorHex }}
            />
          ))}
          {siblings.length > 5 && <span className="text-2xs text-ink-muted">+{siblings.length - 5}</span>}
        </div>
      )}
      <FavoriteButton
        code={product.code}
        price={product.price}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink backdrop-blur transition hover:bg-white"
      />
    </article>
  );
}
