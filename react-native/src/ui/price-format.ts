/**
 * A price in the shopper's language and the product's currency.
 *
 * `Intl.NumberFormat` with `style: 'currency'`, as the storefront's formatter
 * writes it — the currency's own symbol and the language's own separators, never
 * a symbol typed into the SDK. A runtime without `Intl` currency support, or a
 * currency code `Intl` does not know, falls back to a plain amount followed by
 * the code, so a price is never printed in the wrong currency.
 *
 * Plain TypeScript with no `react-native` import.
 */
export function formatMoney(amount: unknown, currency: string | null | undefined, locale?: string | null): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const code = String(currency ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat(locale || undefined, { style: 'currency', currency: code }).format(value);
    } catch {
      // `Intl` is missing or does not know this code: the plain amount below.
    }
  }
  const plain = value.toFixed(2).replace('.', ',');
  return code ? `${plain} ${code}` : plain;
}
