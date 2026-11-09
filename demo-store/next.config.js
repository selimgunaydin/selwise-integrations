/** @type {import('next').NextConfig} */
const nextConfig = {
  // NO `output: 'standalone'`: inside a pnpm workspace the standalone tree's
  // recursive symlinks get followed by the next build's cleanup and delete
  // through into the real package store.
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // better-sqlite3 is a native addon; it must be required at runtime, never bundled.
    serverComponentsExternalPackages: ['better-sqlite3', '@resvg/resvg-js'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The demo must never be indexed as if it were a real shop.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/img/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};

module.exports = nextConfig;
