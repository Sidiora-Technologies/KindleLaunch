import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Runtime CSP middleware.
 *
 * Moves Content-Security-Policy out of next.config.ts (build-time) so that
 * NEXT_PUBLIC_WALLET_IFRAME_ORIGIN is always read at request time — no stale
 * Docker layer cache can silently erase the frame-ancestors directive.
 */

const knownApiOrigins = [
  process.env.NEXT_PUBLIC_CANDLES_API || 'https://candlemicroservice-production.up.railway.app',
  process.env.NEXT_PUBLIC_INDEXER_API || 'https://indexer-production-c407.up.railway.app',
  process.env.NEXT_PUBLIC_METADATA_API || 'https://metadata-production-ae57.up.railway.app',
  process.env.NEXT_PUBLIC_RANKING_API || 'https://ranking-algomicroservice-production.up.railway.app',
  process.env.NEXT_PUBLIC_STATS_API || 'https://statsmicroservice-production.up.railway.app',
  process.env.NEXT_PUBLIC_USERS_API || 'https://users-production-3285.up.railway.app',
  process.env.NEXT_PUBLIC_CHAT_API || 'https://chat-production-a147.up.railway.app',
  process.env.NEXT_PUBLIC_LIVESTREAM_API || 'https://livestream-production-346f.up.railway.app',
  process.env.NEXT_PUBLIC_PNL_API || 'https://pnl-production-4208.up.railway.app',
].map((url) => {
  try { return new URL(url).origin; } catch { return url.replace(/\/+$/, ''); }
});

const rpcOrigins: string[] = [];
for (const v of [process.env.NEXT_PUBLIC_RPC_URL, process.env.NEXT_PUBLIC_PAXEER_RPC_URL]) {
  if (!v) continue;
  try { rpcOrigins.push(new URL(v).origin); } catch {}
}

// Paxeer Embedded Wallet — REST API + Supabase auth/realtime.
const embeddedWalletOrigins: string[] = [];
for (const v of [
  process.env.NEXT_PUBLIC_PAXEER_WALLET_API,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
]) {
  if (!v) continue;
  try { embeddedWalletOrigins.push(new URL(v).origin); } catch {}
}

// External data sources fetched directly from the client
const externalDataOrigins = [
  'https://api.paxscan.io',
];

// WebSocket services need direct access from the client (can't proxy WS via API routes)
const wsOrigins = [
  process.env.NEXT_PUBLIC_CANDLES_API || 'https://candlemicroservice-production.up.railway.app',
  process.env.NEXT_PUBLIC_CHAT_API || 'https://chat-production-a147.up.railway.app',
].map((url) => {
  try { return new URL(url).origin; } catch { return url.replace(/\/+$/, ''); }
});

const connectSrc = [...new Set([
  ...knownApiOrigins,
  ...rpcOrigins,
  ...wsOrigins,
  ...externalDataOrigins,
  ...embeddedWalletOrigins,
])].join(' ');

function buildCsp(): string {
  // Read wallet origin at runtime — supports comma-separated list
  const walletOriginRaw = process.env.NEXT_PUBLIC_WALLET_IFRAME_ORIGIN || '';
  const walletOrigins = walletOriginRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const frameAncestors = walletOrigins.length > 0
    ? `frame-ancestors 'self' ${walletOrigins.join(' ')}`
    : "frame-ancestors 'self'";

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' blob:",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https: ${connectSrc}`,
    "font-src 'self' data:",
    `connect-src 'self' ${connectSrc} wss:`,
    "worker-src 'self' blob:",
    `child-src 'self' blob:${walletOrigins.length > 0 ? ' ' + walletOrigins.join(' ') : ''}`,
    `frame-src 'self' blob:${walletOrigins.length > 0 ? ' ' + walletOrigins.join(' ') : ''}`,
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    frameAncestors,
  ];

  return directives.join('; ');
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Baseline security headers applied to EVERY route (incl. the charting
  // library branch below). HSTS forces TLS; nosniff blocks MIME-confusion
  // XSS; Referrer-Policy avoids leaking full URLs cross-origin.
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=15552000; includeSubDomains; preload',
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Charting library gets a permissive CSP (TradingView requirement)
  if (pathname.startsWith('/charting_library')) {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-eval' 'unsafe-inline' blob: data:; worker-src 'self' blob:; child-src 'self' blob:",
    );
    return response;
  }

  const csp = buildCsp();
  response.headers.set('Content-Security-Policy', csp);

  // Only set X-Frame-Options if no wallet origin is configured
  // (CSP frame-ancestors supersedes X-Frame-Options per spec)
  const walletOrigin = process.env.NEXT_PUBLIC_WALLET_IFRAME_ORIGIN || '';
  if (!walletOrigin) {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  }

  response.headers.set('Permissions-Policy', 'clipboard-write=(self), clipboard-read=(self)');

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
};
