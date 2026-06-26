import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side SDK proxy.
 *
 * Routes all client API calls through the Next.js server so that:
 * 1. Backend URLs are hidden from the client bundle.
 * 2. Responses can be cached at the edge / server (especially metadata & images).
 * 3. The browser only talks to our own domain — avoids CORS and CSP issues.
 *
 * URL pattern: /api/sdk/{service}/{...rest}
 * Example:     /api/sdk/metadata/metadata/0xABC.json
 *              → https://metadata-production-ae57.up.railway.app/metadata/0xABC.json
 */

// Service name → upstream base URL (server-side only, not exposed to client)
const SERVICE_MAP: Record<string, string> = {
  candles: process.env.NEXT_PUBLIC_CANDLES_API || 'https://candlemicroservice-production.up.railway.app',
  indexer: process.env.NEXT_PUBLIC_INDEXER_API || 'https://indexer-production-c407.up.railway.app',
  metadata: process.env.NEXT_PUBLIC_METADATA_API || 'https://metadata-production-ae57.up.railway.app',
  ranking: process.env.NEXT_PUBLIC_RANKING_API || 'https://ranking-algomicroservice-production.up.railway.app',
  stats: process.env.NEXT_PUBLIC_STATS_API || 'https://statsmicroservice-production.up.railway.app',
  users: process.env.NEXT_PUBLIC_USERS_API || 'https://users-production-3285.up.railway.app',
  chat: process.env.NEXT_PUBLIC_CHAT_API || 'https://chat-production-a147.up.railway.app',
  livestream: process.env.NEXT_PUBLIC_LIVESTREAM_API || 'https://livestream-production-346f.up.railway.app',
  pnl: process.env.NEXT_PUBLIC_PNL_API || 'https://pnl-production-4208.up.railway.app',
};

// Cache TTLs per service (seconds). 0 = no-store.
//
// Personal + realtime services MUST be 0: their responses are user-specific
// and would otherwise be served to other users from a shared CDN/proxy key
// (privacy leak + staleness). Only impersonal, cacheable data gets a positive
// s-maxage. Authed requests are additionally forced to no-store below.
const CACHE_TTL: Record<string, number> = {
  metadata: 86400,    // 24h — token metadata/images are immutable
  ranking: 30,        // 30s — rankings
  stats: 3,           // 3s — pool stats update often
  indexer: 2,         // 2s — recent txs
  candles: 1,         // 1s — candle data is near-realtime
  users: 0,           // no-store — personal profile data
  chat: 0,            // no-store — realtime chat
  livestream: 0,      // no-store — realtime livestream
  pnl: 0,             // no-store — personal per-wallet PNL (financial data)
};

// Stale-while-revalidate duration (serve stale while fetching fresh).
// Only defined for the cacheable (positive-TTL) services.
const SWR_TTL: Record<string, number> = {
  metadata: 604800,   // 7d SWR for metadata
  ranking: 50,
  stats: 5,
};

// Request headers that indicate a user-authenticated/personalized request.
// Any of these present => the response is user-specific and must never be
// written to a shared cache, regardless of the service's default TTL.
const AUTH_HEADERS = ['authorization', 'x-wallet', 'x-signature', 'x-message', 'x-nonce', 'x-expires-at'];

type RouteParams = { params: Promise<{ service: string; path: string[] }> };

async function handler(request: NextRequest, { params }: RouteParams) {
  const { service, path } = await params;

  const baseUrl = SERVICE_MAP[service];
  if (!baseUrl) {
    return NextResponse.json({ error: `Unknown service: ${service}` }, { status: 404 });
  }

  const upstreamPath = path.join('/');
  const url = new URL(upstreamPath, baseUrl.replace(/\/$/, '') + '/');

  // Authed/personalized requests are never shared-cached, even for services
  // that are otherwise publicly cacheable.
  const isAuthed = AUTH_HEADERS.some((h) => request.headers.get(h));
  const ttl = isAuthed ? 0 : (CACHE_TTL[service] ?? 30);
  const swr = ttl > 0 ? (SWR_TTL[service] ?? ttl) : 0;

  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Forward request (method, headers, body)
  const headers = new Headers();
  // Forward safe headers from the original request
  const forwardHeaders = ['content-type', 'accept', 'authorization', 'x-request-id', 'x-wallet', 'x-signature', 'x-message', 'x-nonce', 'x-expires-at'];
  for (const h of forwardHeaders) {
    const val = request.headers.get(h);
    if (val) headers.set(h, val);
  }

  try {
    const upstreamRes = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : undefined,
      // Next.js fetch cache — revalidate based on resolved TTL (0 => no cache)
      cache: ttl > 0 ? undefined : 'no-store',
      next: ttl > 0 ? { revalidate: ttl } : undefined,
    });

    // Build response with proper cache headers
    const responseHeaders = new Headers();
    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) responseHeaders.set('Content-Type', contentType);

    // Set cache-control for the browser/CDN.
    if (ttl > 0) {
      responseHeaders.set(
        'Cache-Control',
        `public, s-maxage=${ttl}, stale-while-revalidate=${swr}`,
      );
    } else {
      responseHeaders.set('Cache-Control', 'no-store');
    }

    // For images/binary content, stream the body directly
    const body = await upstreamRes.arrayBuffer();

    return new NextResponse(body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`[sdk-proxy] ${service}/${upstreamPath} failed:`, err);
    return NextResponse.json(
      { error: 'Upstream service unavailable' },
      { status: 502 },
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
