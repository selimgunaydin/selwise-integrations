'use client';

import { useEffect } from 'react';
import { trackOrder, type OrderForSelwise } from '@/lib/selwise/client';
import { clearDraft } from '@/lib/checkout/draft';
import { useStore } from '@/components/Providers';

/** The thank-you page's one job toward Selwise: report the order, once. */
export function SuccessTracker({ order, token }: { order: OrderForSelwise; token: string }) {
  const { refresh } = useStore();
  useEffect(() => {
    clearDraft();
    void refresh();
    // Marketing consent ticked at checkout travels with the order.
    void fetch(`/api/orders/${token}/consent`)
      .then((r) => (r.ok ? r.json() : { email: false, sms: false }))
      .then((c: { email: boolean; sms: boolean }) => trackOrder({ ...order, marketingEmail: c.email, marketingSms: c.sms }))
      .catch(() => trackOrder(order));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.number]);
  return null;
}
