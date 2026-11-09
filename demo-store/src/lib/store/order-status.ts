/**
 * An order's statuses, free of the database so the browser can import them.
 * The store (`orders.ts`) and the test panel read the same list.
 */
export type OrderStatus = 'awaiting_payment' | 'received' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'return_requested' | 'returned';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'Ödeme bekleniyor',
  received: 'Sipariş alındı',
  preparing: 'Hazırlanıyor',
  shipped: 'Kargoya verildi',
  delivered: 'Teslim edildi',
  cancelled: 'İptal edildi',
  return_requested: 'İade talebi alındı',
  returned: 'İade edildi',
};

/** The happy path, in order. Cancelled and returned orders sit outside it. */
export const ORDER_FLOW: OrderStatus[] = ['awaiting_payment', 'received', 'preparing', 'shipped', 'delivered'];

/** What "the next step" means for a status: the one after it on the happy path, or nothing. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW.indexOf(status);
  return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null;
}

/** The business event a status change reports to Selwise: `order_shipped`, `order_delivered`… */
export const orderEventKey = (status: OrderStatus) => `order_${status}`;
