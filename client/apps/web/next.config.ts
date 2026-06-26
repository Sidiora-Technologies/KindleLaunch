import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

// Run `ANALYZE=true pnpm --filter @sidiora/web build` to emit treemap reports
// (.next/analyze/*.html) for per-route JS budgeting. No-op for normal builds.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

// CSP headers are now set at RUNTIME via src/middleware.ts so that
// NEXT_PUBLIC_WALLET_IFRAME_ORIGIN is always read fresh (not baked at build time).

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'metadata-production-ae57.up.railway.app' },
      { protocol: 'https', hostname: 'sidiora.fun' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: 'cloudflare-ipfs.com' },
      { protocol: 'https', hostname: 'arweave.net' },
      { protocol: 'https', hostname: 'nftstorage.link' },
    ],
    // Permit SVG token logos (placeholders are dicebear SVG) but sandbox
    // the response so a crafted SVG cannot execute scripts, and force
    // `Content-Disposition: attachment` so direct navigation downloads
    // rather than renders. See Next.js images.dangerouslyAllowSVG docs.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; sandbox;",
  },

  experimental: {
    serverActions: {},
    mdxRs: true,
  },

  transpilePackages: [
    'candles-sdk',
    'indexer-sdk',
    'metadata-sdk',
    'ranking-algo-sdk',
    'stats-sdk',
    'users-sdk',
    'sidiora-launchpad-v3',
    'paxifyui',
    'sidiora-ui-tokens',
  ],
};

// Wrap with Sentry. Source-map upload only runs when SENTRY_AUTH_TOKEN is set
// (CI/release builds); locally it is a transparent no-op. `tunnelRoute` proxies
// Sentry ingestion through our own origin so ad-blockers don't drop events.
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  disableLogger: true,
  automaticVercelMonitors: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
