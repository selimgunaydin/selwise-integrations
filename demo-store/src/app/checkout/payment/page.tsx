import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser, publicUser } from '@/lib/store/auth';
import { loadCart, readCartId } from '@/lib/store/cart';
import { PaymentStep } from './PaymentStep';

export const metadata: Metadata = { title: 'Ödeme' };

export default function PaymentPage() {
  const cart = loadCart(readCartId());
  if (cart.lines.length === 0) redirect('/cart');
  return <PaymentStep user={publicUser(currentUser())} />;
}
