import type { Metadata } from 'next';
import { requireUser } from '@/lib/account/server';
import { db } from '@/lib/store/db';
import { liveProduct } from '@/lib/store/products';
import { Slot, SLOTS } from '@/components/selwise/Slot';
import { AccountHeading } from '@/components/account/AccountHeading';
import { FavoritesGrid, type FavoriteItem } from '@/components/account/FavoritesGrid';

export const metadata: Metadata = { title: 'Favorilerim' };

export default function FavoritesPage() {
  const user = requireUser('/account/favorilerim');
  const rows = db().prepare('SELECT code FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(user.id) as Array<{ code: string }>;
  const items: FavoriteItem[] = [];
  for (const r of rows) {
    const p = liveProduct(r.code);
    if (!p) continue;
    items.push({
      code: p.code,
      slug: p.slug,
      title: p.title,
      brand: p.brand,
      colorName: p.colorName,
      price: p.price,
      listPrice: p.listPrice,
      discountRate: p.discountRate,
      stock: p.sizes.reduce((s, x) => s + x.stock, 0),
    });
  }

  return (
    <div>
      <AccountHeading eyebrow="Hesabım" title="Favorilerim" description="Beğendiğiniz ürünleri burada saklayın; fiyatı düştüğünde veya stoğa girdiğinde haberdar olun." />
      <FavoritesGrid items={items} />
      {/* Server-rendered once; the widget owns what goes inside. */}
      <Slot name={SLOTS.favoritesRecs} className="mt-14 block" />
    </div>
  );
}
