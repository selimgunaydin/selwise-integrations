import type { MetadataRoute } from 'next';

/** The demo store must never be indexed as if it were a real shop. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
