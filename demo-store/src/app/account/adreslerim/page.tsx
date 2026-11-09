import type { Metadata } from 'next';
import { listAddresses, requireUser } from '@/lib/account/server';
import { AddressBook } from '@/components/account/AddressBook';

export const metadata: Metadata = { title: 'Adreslerim' };

export default function AddressesPage() {
  const user = requireUser('/account/adreslerim');
  return (
    <AddressBook
      initial={listAddresses(user.id)}
      defaults={{ firstName: user.first_name, lastName: user.last_name, phone: user.phone || '' }}
    />
  );
}
