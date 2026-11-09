'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useStore } from '../Providers';
import { identify } from '@/lib/selwise/client';

/** Tell Selwise who the signed-in shopper is, on every route. */
export function Identify() {
  const { user } = useStore();
  const pathname = usePathname();
  useEffect(() => {
    if (user) identify(user);
  }, [user, pathname]);
  return null;
}
