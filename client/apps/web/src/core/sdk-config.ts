/**
 * Gateway configuration for the push-first KindleLaunch backend.
 *
 * The legacy 9-microservice topology (each Railway service proxied through the
 * Next.js `/api/sdk/{service}` route) is replaced by TWO public gateways that
 * the browser reaches DIRECTLY through same-origin nginx paths (decision
 * 2026-06-26):
 *
 *   - core/api      — the DATA edge. Push-first: REST is bootstrap-snapshot only
 *                     (UDF candles, pool stats, rankings, platform metrics,
 *                     token BFF); live deltas ride WSS `/ws` (multiplexed) /
 *                     `/ws/candles`, or SSE `/stream` as a fallback transport.
 *   - media/gateway — the MEDIA + SOCIAL edge: R2 media serve/cache, uploads,
 *                     and the WSS tunnel fronting social (chat/comments/DMs/
 *                     livestream).
 *
 * nginx routes (same-origin, no Next.js hop for data):
 *   /api/*    -> core/api          (REST snapshot)
 *   /ws       -> core/api          (multiplexed WSS)
 *   /ws/candles -> core/api        (charts-parity WSS)
 *   /stream   -> core/api          (SSE fallback)
 *   /media/*  -> media/gateway     (REST + uploads + media serve)
 *   /media/ws -> media/gateway     (social WSS tunnel)
 *
 * Each path is overridable via env for split-host deployments (a gateway on a
 * distinct public origin); the defaults are same-origin relative paths.
 */

const GATEWAY = {
  // Absolute origin overrides (empty => same-origin). Use for split-host setups,
  // e.g. NEXT_PUBLIC_DATA_ORIGIN=https://api.kindlelaunch.fun
  dataOrigin: (process.env.NEXT_PUBLIC_DATA_ORIGIN || '').replace(/\/$/, ''),
  mediaOrigin: (process.env.NEXT_PUBLIC_MEDIA_ORIGIN || '').replace(/\/$/, ''),
  // Path prefixes (same-origin nginx routing).
  dataApiBase: process.env.NEXT_PUBLIC_DATA_API_BASE || '/api',
  mediaApiBase: process.env.NEXT_PUBLIC_MEDIA_API_BASE || '/media',
  dataWsPath: process.env.NEXT_PUBLIC_DATA_WS_PATH || '/ws',
  dataCandlesWsPath: process.env.NEXT_PUBLIC_DATA_CANDLES_WS_PATH || '/ws/candles',
  dataSsePath: process.env.NEXT_PUBLIC_DATA_SSE_PATH || '/stream',
  mediaWsPath: process.env.NEXT_PUBLIC_MEDIA_WS_PATH || '/media/ws',
} as const;

/**
 * Resolve the app origin for SSR (where relative URLs cannot be fetched). On the
 * client an empty string yields same-origin relative URLs.
 */
function getAppOrigin(): string {
  if (typeof window !== 'undefined') return '';
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return 'http://localhost:3000';
}

/** Join a base + path with exactly one slash between them. */
function join(base: string, path: string): string {
  if (!path) return base;
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Build a REST URL on the DATA gateway (core/api). `path` is the core/api route
 * (e.g. `/stats/0xabc`, `/rankings/trending`, `/udf/history`, `/bff/token/0x`,
 * `/platform/metrics`). Same-origin by default; absolute in SSR / split-host.
 */
export function dataApiUrl(path: string): string {
  const origin = GATEWAY.dataOrigin || getAppOrigin();
  return join(`${origin}${GATEWAY.dataApiBase}`, path);
}

/** Build a REST URL on the MEDIA gateway (media/gateway). */
export function mediaApiUrl(path: string): string {
  const origin = GATEWAY.mediaOrigin || getAppOrigin();
  return join(`${origin}${GATEWAY.mediaApiBase}`, path);
}

/** ws/wss scheme matching the current page (client) or the configured origin. */
function wsScheme(origin: string): string {
  if (origin.startsWith('https')) return 'wss';
  if (origin.startsWith('http')) return 'ws';
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') return 'wss';
  return 'ws';
}

/** Absolute ws(s):// URL for a path on the given (possibly empty) origin. */
function wsUrl(origin: string, path: string): string {
  if (origin) {
    const scheme = wsScheme(origin);
    const host = origin.replace(/^https?:\/\//, '');
    return `${scheme}://${join(host, path)}`;
  }
  if (typeof window !== 'undefined') {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${join(window.location.host, path)}`;
  }
  // SSR has no live socket; return a syntactically-valid placeholder.
  return `ws://localhost${path.startsWith('/') ? path : `/${path}`}`;
}

/** Multiplexed data WSS endpoint (core/api `/ws`). */
export function dataWsUrl(): string {
  return wsUrl(GATEWAY.dataOrigin, GATEWAY.dataWsPath);
}

/** Charts-parity candle WSS endpoint (core/api `/ws/candles`). */
export function dataCandlesWsUrl(): string {
  return wsUrl(GATEWAY.dataOrigin, GATEWAY.dataCandlesWsPath);
}

/** Social/media WSS tunnel endpoint (media/gateway `/media/ws`). */
export function mediaWsUrl(): string {
  return wsUrl(GATEWAY.mediaOrigin, GATEWAY.mediaWsPath);
}

/**
 * SSE fallback URL (core/api `/stream`). Subscription is expressed via query
 * params (SSE has no client->server channel): `channels` (comma-separated, or
 * `*` for all) and `pools` (comma-separated; empty => all pools).
 */
export function dataStreamUrl(opts?: { channels?: string[]; pools?: string[] }): string {
  const origin = GATEWAY.dataOrigin || getAppOrigin();
  const url = join(`${origin}`, GATEWAY.dataSsePath);
  const qs = new URLSearchParams();
  if (opts?.channels && opts.channels.length) qs.set('channels', opts.channels.join(','));
  if (opts?.pools && opts.pools.length) qs.set('pools', opts.pools.join(','));
  const q = qs.toString();
  return q ? `${url}?${q}` : url;
}

/** Avatar URL on the media gateway. */
export function getUserAvatarUrl(walletAddress: string): string {
  return mediaApiUrl(`/users/${walletAddress}/avatar`);
}

// ── Backward-compatibility shims (deprecated) ──────────────────────────────
//
// The per-service `sdkBaseUrls`/`getServiceWsUrl` surface is retained so the
// ~47 files still on the legacy client layer keep compiling while Phase 2
// migrates them to the gateway primitives above. WS helpers are already
// repointed to the new gateways so the two realtime paths (candles, social)
// align immediately; REST shims map each old service onto its core/api route
// prefix (or the media gateway) so calls flow same-origin through nginx.

/** @deprecated Use `dataApiUrl` / `mediaApiUrl`. */
export const sdkBaseUrls = {
  // core/api (data) REST prefixes
  candles: dataApiUrl('/udf'), // old client appends /history, /config, /symbols, /time
  indexer: dataApiUrl(''), // recent-tx reads move to the multiplexed stream (Phase 2)
  ranking: dataApiUrl(''), // old client appends /rankings/{category}
  stats: dataApiUrl(''), // old client appends /stats/{pool}
  // media/gateway REST prefixes
  metadata: mediaApiUrl('/metadata'),
  users: mediaApiUrl('/users'),
  chat: mediaApiUrl('/chat'),
  livestream: mediaApiUrl('/livestream'),
  pnl: mediaApiUrl('/pnl'),
} as const;

export type WsService = 'candles' | 'chat';
/**
 * @deprecated Use `dataCandlesWsUrl()` / `mediaWsUrl()` directly. Repointed to
 * the new gateways: `candles` -> core/api `/ws/candles`; `chat` -> media/gateway
 * `/media/ws`.
 */
export function getServiceWsUrl(service: WsService): string {
  return service === 'candles' ? dataCandlesWsUrl() : mediaWsUrl();
}
