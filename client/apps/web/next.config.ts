import path from 'path';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

// Run `ANALYZE=true pnpm --filter @sidiora/web build` to emit treemap reports
// (.next/analyze/*.html) for per-route JS budgeting. No-op for normal builds.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

// CSP headers are now set at RUNTIME via src/middleware.ts so that
// NEXT_PUBLIC_WALLET_IFRAME_ORIGIN is always read fresh (not baked at build time).

const nextConfig: NextConfig = {
  // `standalone` is for the Railway/Docker runtime (`node .next/standalone/
  // server.js`). On Vercel it is unnecessary and its file-tracing follows
  // pnpm's symlinked node_modules to absolute paths that break the deploy
  // (styled-jsx ENOENT), so disable it there (Vercel sets VERCEL=1 at build).
  output: process.env.VERCEL ? undefined : 'standalone',
  compress: true,

  // This app lives at client/apps/web inside a pnpm workspace whose root is
  // client/. Next's NFT auto-detection picks the wrong tracing root and emits
  // symlinks that escape to an absolute /node_modules/.pnpm/... path, which
  // makes `vercel deploy --prebuilt` die with `ENOENT lstat .../styled-jsx`
  // (next.js#73648). Pinning the trace root to the workspace root keeps every
  // traced symlink relative and inside the uploaded artifact.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.kindlelaunch.com' },
      { protocol: 'https', hostname: 'kindleusercontent.kindlelaunch.com' },
      { protocol: 'https', hostname: 'cdn.kindlelaunch.com' },
      { protocol: 'https', hostname: 'metadata.kindlelaunch.com' },
      { protocol: 'https', hostname: 'socialapi.kindlelaunch.com' },
      { protocol: 'https', hostname: 'userpnl.kindlelaunch.com' },
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
