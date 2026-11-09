import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { Selwise } from '@selwise/react-native';

/**
 * One Selwise client for the whole app.
 *
 * - `storage: AsyncStorage`: the visitor id, the session and the unsent queue
 *   survive a restart. Without it the SDK runs in memory and every launch is a
 *   new visitor.
 * - `consent: { granted: false }`: nothing that measures the visitor is sent
 *   until the consent sheet answers (components/ConsentSheet). Events recorded
 *   meanwhile are held, not dropped.
 * - `setAppState`: flushes the queue when the app leaves the foreground and
 *   drives the Live View heartbeat while it is active.
 */
export const STORE_URL = (process.env.EXPO_PUBLIC_STORE_URL || 'https://demo.selwise.com').replace(/\/+$/, '');
export const CURRENCY = 'TRY';
export const LOCALE = 'tr-TR';

export const selwise = new Selwise();

let started: Promise<void> | null = null;

export function initSelwise(): Promise<void> {
  if (started) return started;
  const channelKey = process.env.EXPO_PUBLIC_SELWISE_CHANNEL_KEY;
  const apiKey = process.env.EXPO_PUBLIC_SELWISE_API_KEY;
  if (!channelKey || !apiKey) {
    return Promise.reject(new Error('EXPO_PUBLIC_SELWISE_CHANNEL_KEY ve EXPO_PUBLIC_SELWISE_API_KEY tanımlı değil (.env.example).'));
  }
  started = selwise
    .init({
      channelKey,
      apiKey,
      ...(process.env.EXPO_PUBLIC_SELWISE_API_URL ? { apiUrl: process.env.EXPO_PUBLIC_SELWISE_API_URL } : {}),
      storage: AsyncStorage,
      consent: { granted: false },
      locale: 'tr',
      debug: __DEV__,
    })
    .then(() => {
      AppState.addEventListener('change', (state) => selwise.setAppState(state));
    });
  return started;
}

export function formatPrice(amount: number, currency = CURRENCY) {
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
