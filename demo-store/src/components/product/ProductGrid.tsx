import type { Product } from '@/lib/catalog';
import { ProductCard } from './ProductCard';
import { ListTracker } from './ListTracker';

export function ProductGrid({ products, list, cols = 4, resetKey }: { products: Product[]; list: string; cols?: 3 | 4; resetKey?: string }) {
  return (
    <ListTracker resetKey={resetKey} className={`grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 ${cols === 4 ? 'lg:grid-cols-4' : ''}`}>
      {products.map((p, i) => (
        <ProductCard key={p.code} product={p} list={list} position={i + 1} priority={i < 4} />
      ))}
    </ListTracker>
  );
}

/** A horizontal strip of cards (home rails, PDP "complete the look"). */
export function ProductRail({ products, list }: { products: Product[]; list: string }) {
  return (
    <ListTracker className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
      {products.map((p, i) => (
        <div key={p.code} className="w-[46%] shrink-0 snap-start md:w-auto">
          <ProductCard product={p} list={list} position={i + 1} />
        </div>
      ))}
    </ListTracker>
  );
}
