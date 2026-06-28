import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Runtime CSP middleware.
 *
 * Moves Content-Security-Policy out of next.config.ts (build-time) so that
 * NEXT_PUBLIC_WALLET_IFRAME_ORIGIN is always read at request time — no stale
 * Docker layer cache can silently erase the frame-ancestors directive.
 */

// Backend topology (decision 2026-06-26): the browser talks to the two gateways
// (core/api data + media/gateway) DIRECTLY through same-origin nginx paths
// (/api, /media, /ws, /stream). `connect-src 'self'` therefore covers REST + SSE,
// and same-origin WSS is covered by 'self' (with `wss:` retained as a belt-and-
// braces allowance). The only EXPLICIT cross-origin entries are for SPLIT-HOST
// deployments where a gateway lives on its own public origin.
const gatewayOrigins: string[] = [];
for (const v of [process.env.NEXT_PUBLIC_DATA_ORIGIN, process.env.NEXT_PUBLIC_MEDIA_ORIGIN]) {
  if (!v) continue;
  try { gatewayOrigins.push(new URL(v).origin); } catch {}
}

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

// The six dedicated backend hosts the browser talks to (decision 2026-06-27).
// Defaults mirror core/sdk-config.ts; each is overridable per-env for split-host
// / preview deployments. wss: (below) already covers the WS/SSE upgrades.
const kindleHosts = [
  process.env.NEXT_PUBLIC_DATA_API_URL || 'https://api.kindlelaunch.com',
  process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://cdn.kindlelaunch.com',
  process.env.NEXT_PUBLIC_USER_API_URL || 'https://kindleusercontent.kindlelaunch.com',
  process.env.NEXT_PUBLIC_METADATA_API_URL || 'https://metadata.kindlelaunch.com',
  process.env.NEXT_PUBLIC_SOCIAL_API_URL || 'https://socialapi.kindlelaunch.com',
  process.env.NEXT_PUBLIC_PNL_API_URL || 'https://userpnl.kindlelaunch.com',
].reduce<string[]>((acc, v) => {
  try { acc.push(new URL(v).origin); } catch {}
  return acc;
}, []);

const connectSrc = [...new Set([
  ...gatewayOrigins,
  ...kindleHosts,
  ...rpcOrigins,
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
