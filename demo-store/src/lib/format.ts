const TRY = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 });

/** "1.899,00 TL" — Turkish shops print the code after the amount. */
export function formatPrice(n: number) {
  return TRY.format(n).replace('₺', '').trim() + ' TL';
}

export function formatDate(iso: string, withTime = false) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
