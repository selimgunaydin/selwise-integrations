import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser, publicUser } from '@/lib/store/auth';
import { loadCart, readCartId } from '@/lib/store/cart';
import { db } from '@/lib/store/db';
import { ShippingStep, type SavedAddress } from './ShippingStep';

export const metadata: Metadata = { title: 'Teslimat Bilgileri' };

export default function ShippingPage({ searchParams }: { searchParams: { guest?: string } }) {
  const cart = loadCart(readCartId());
  if (cart.lines.length === 0) redirect('/cart');
  const user = currentUser();
  const addresses = user
    ? (db()
        .prepare('SELECT id, title, first_name, last_name, phone, city, district, line, postcode, is_default FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC')
        .all(user.id) as SavedAddress[])
    : [];
  return <ShippingStep user={publicUser(user)} addresses={addresses} guest={searchParams.guest === '1'} />;
}
