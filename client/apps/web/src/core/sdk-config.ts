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
 * Public hosts (decision 2026-06-27 — each service on its own origin):
 *   api.kindlelaunch.com             -> core/api        (DATA: REST snapshot + WS/SSE)
 *   cdn.kindlelaunch.com             -> media/gateway   (auth, uploads, R2 serve, social WRITES + WS)
 *   kindleusercontent.kindlelaunch.com -> media/user    (profiles, avatars, watchlist)
 *   metadata.kindlelaunch.com        -> media/metadata  (token metadata, logos, banners)
 *   socialapi.kindlelaunch.com       -> media/social    (chat/comments/DM READS)
 *   userpnl.kindlelaunch.com         -> core/pnl-tracker(portfolio, cards, referrals)
 *
 * Reads go DIRECT to the dedicated read host; authenticated SOCIAL writes + the
 * social WS go through the gateway (it injects the trusted X-Actor-Wallet). Each
 * host is overridable via NEXT_PUBLIC_*_URL env for local / split-host setups.
 */

// Each backend service is exposed at its OWN public host (decision 2026-06-27).
// Reads hit the dedicated read hosts directly; authenticated SOCIAL writes (and
// the social WS) must traverse the gateway, which strips client-supplied
// X-Actor-Wallet and injects the trusted actor from the session. Every host is
// env-overridable for local / split-host / preview deployments.
const trimSlash = (v: string) => v.replace(/\/$/, '');

const HOSTS = {
  // core/api — the DATA edge: /ws, /ws/candles, /stream, /bff/token, /stats,
  // /rankings, /platform/metrics, /udf, /status.
  data: trimSlash(process.env.NEXT_PUBLIC_DATA_API_URL || 'https://api.kindlelaunch.com'),
  // media/gateway — auth + uploads + R2 serve + the actor-injecting social
  // write/WS edge.
  gateway: trimSlash(process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://cdn.kindlelaunch.com'),
  // media/user — profiles, avatars/banners, watchlist.
  user: trimSlash(process.env.NEXT_PUBLIC_USER_API_URL || 'https://kindleusercontent.kindlelaunch.com'),
  // media/metadata — token metadata + logos/banners.
  metadata: trimSlash(process.env.NEXT_PUBLIC_METADATA_API_URL || 'https://metadata.kindlelaunch.com'),
  // media/social — pool chat, comments, DMs, follows (READS, direct).
  social: trimSlash(process.env.NEXT_PUBLIC_SOCIAL_API_URL || 'https://socialapi.kindlelaunch.com'),
  // core/pnl-tracker — portfolio, positions, trades, cards, referrals.
  pnl: trimSlash(process.env.NEXT_PUBLIC_PNL_API_URL || 'https://userpnl.kindlelaunch.com'),
} as const;

// Path prefixes / WS routes (host-relative; env-overridable).
const PATHS = {
  dataWs: process.env.NEXT_PUBLIC_DATA_WS_PATH || '/ws',
  dataCandlesWs: process.env.NEXT_PUBLIC_DATA_CANDLES_WS_PATH || '/ws/candles',
  dataSse: process.env.NEXT_PUBLIC_DATA_SSE_PATH || '/stream',
  // The gateway mounts social under /social and strips that prefix before
  // forwarding to media/social (whose routes live at root).
  socialWritePrefix: process.env.NEXT_PUBLIC_SOCIAL_WRITE_PREFIX || '/social',
  socialWs: process.env.NEXT_PUBLIC_SOCIAL_WS_PATH || '/social/ws',
} as const;

/** Join a base + path with exactly one slash between them. */
function join(base: string, path: string): string {
  if (!path) return base;
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Build a REST URL on the DATA edge (core/api `api.kindlelaunch.com`): `/stats`,
 * `/rankings`, `/udf/*`, `/bff/token`, `/platform/metrics`, `/status`.
 */
export function dataApiUrl(path: string): string {
  return join(HOSTS.data, path);
}

/** Build a REST URL on the media/gateway (`cdn.kindlelaunch.com`): /auth, /upload, R2 serve. */
export function gatewayUrl(path: string): string {
  return join(HOSTS.gateway, path);
}

/** @deprecated Use `gatewayUrl`. Retained as an alias during migration. */
export const mediaApiUrl = gatewayUrl;

/** Build a REST URL on media/user (`kindleusercontent.kindlelaunch.com`): /users/*. */
export function userApiUrl(path: string): string {
  return join(HOSTS.user, path);
}

/** Build a REST URL on media/metadata (`metadata.kindlelaunch.com`): /metadata/*, /logo, /banner. */
export function metadataApiUrl(path: string): string {
  return join(HOSTS.metadata, path);
}

/**
 * Build a SOCIAL READ URL — direct to media/social (`socialapi.kindlelaunch.com`).
 * Use for public GETs (messages, comments, follower lists, DM history).
 */
export function socialReadUrl(path: string): string {
  return join(HOSTS.social, path);
}

/**
 * Build a SOCIAL WRITE URL — through the gateway (`cdn.kindlelaunch.com/social`),
 * which authenticates the session and injects the trusted X-Actor-Wallet header
 * media/social requires. Use for POST/PATCH/PUT/DELETE (comments, message
 * moderation, follows, likes). Pass writes with `credentials: 'include'`.
 */
export function socialWriteUrl(path: string): string {
  return join(`${HOSTS.gateway}${PATHS.socialWritePrefix}`, path);
}

/** Build a REST URL on core/pnl-tracker (`userpnl.kindlelaunch.com`): portfolio, cards, referrals. */
export function pnlApiUrl(path: string): string {
  return join(HOSTS.pnl, path);
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
  return wsUrl(HOSTS.data, PATHS.dataWs);
}

/** Charts-parity candle WSS endpoint (core/api `/ws/candles`). */
export function dataCandlesWsUrl(): string {
  return wsUrl(HOSTS.data, PATHS.dataCandlesWs);
}

/**
 * Social WSS tunnel endpoint — through the gateway (`cdn.kindlelaunch.com/social/ws`).
 * The gateway upgrades the WS only for an authenticated session and injects the
 * trusted X-Actor-Wallet (the browser cannot set it on a WS handshake).
 */
export function socialWsUrl(): string {
  return wsUrl(HOSTS.gateway, PATHS.socialWs);
}

/**
 * SSE fallback URL (core/api `/stream`). Subscription is expressed via query
 * params (SSE has no client->server channel): `channels` (comma-separated, or
 * `*` for all) and `pools` (comma-separated; empty => all pools).
 */
export function dataStreamUrl(opts?: { channels?: string[]; pools?: string[] }): string {
  const url = join(HOSTS.data, PATHS.dataSse);
  const qs = new URLSearchParams();
  if (opts?.channels && opts.channels.length) qs.set('channels', opts.channels.join(','));
  if (opts?.pools && opts.pools.length) qs.set('pools', opts.pools.join(','));
  const q = qs.toString();
  return q ? `${url}?${q}` : url;
}

/** Avatar URL on media/user (`kindleusercontent.kindlelaunch.com`). */
export function getUserAvatarUrl(walletAddress: string): string {
  return userApiUrl(`/users/${walletAddress}/avatar`);
}
