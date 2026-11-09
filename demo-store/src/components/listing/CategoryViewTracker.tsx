'use client';

import { useEffect } from 'react';
import { categoryView } from '@/lib/selwise/client';

export function CategoryViewTracker({ path, slug, count }: { path: string[]; slug: string; count: number }) {
  const key = path.join('>');
  useEffect(() => {
    categoryView(path, slug, count);
    // once per category page view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slug]);
  return null;
}
