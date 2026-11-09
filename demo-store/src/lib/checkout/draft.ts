'use client';

import type { AddressInput, ShippingMethod } from '../store/orders';

export interface CheckoutDraft {
  email: string;
  phone: string;
  delivery: 'address' | 'store';
  storeId?: string;
  shippingAddress: AddressInput;
  billingSame: boolean;
  billingAddress?: AddressInput;
  corporate?: { company: string; taxNo: string; taxOffice: string } | null;
  shippingMethod: ShippingMethod;
  saveAddress?: boolean;
}

const KEY = 'ardisa_checkout_draft';

export function saveDraft(d: CheckoutDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

export function readDraft(): CheckoutDraft | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const PENDING = 'ardisa_checkout_pending';

/** The payment step hands the order to the 3-D Secure page through here. */
export function savePending(p: Record<string, unknown>) {
  try {
    sessionStorage.setItem(PENDING, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function readPending<T>(): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING) || 'null');
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(PENDING);
  } catch {
    /* ignore */
  }
}
