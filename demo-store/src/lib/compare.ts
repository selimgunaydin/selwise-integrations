'use client';

const KEY = 'ardisa_compare';
export const COMPARE_MAX = 4;

export function readCompare(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function toggleCompare(code: string): string[] {
  const cur = readCompare();
  const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code].slice(-COMPARE_MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
