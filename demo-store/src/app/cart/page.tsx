import type { Metadata } from 'next';
import { CartPageClient } from './CartPageClient';
import { Slot, SLOTS } from '@/components/selwise/Slot';

export const metadata: Metadata = { title: 'Sepetim' };

export default function CartPage() {
  return (
    <div className="container pt-8">
      <h1 className="font-display text-4xl">Sepetim</h1>
      <Slot name={SLOTS.cartTop} className="mt-6 block" />
      <CartPageClient />
      <Slot name={SLOTS.cartRecs} className="mt-20 block" />
    </div>
  );
}
