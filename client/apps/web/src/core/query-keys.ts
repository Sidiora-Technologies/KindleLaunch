/**
 * Centralized TanStack Query key factory.
 * All query keys in the app should be defined here for deduplication and
 * cache invalidation consistency.
 */

export const queryKeys = {
  // ── Token stats (per pool) ───────────────────────────────────
  tokenStats: (poolAddress: string) =>
    ['token-stats', poolAddress.toLowerCase()] as const,

  tokenStatsBatch: (pools: string[]) =>
    ['token-stats-batch', pools.map((p) => p.toLowerCase()).sort().join(',')] as const,

  // ── Token metadata (per token address) ───────────────────────
  tokenMetadata: (tokenAddress: string) =>
    ['token-metadata', tokenAddress.toLowerCase()] as const,

  tokenMetadataBatch: (tokens: string[]) =>
    ['token-metadata-batch', tokens.map((t) => t.toLowerCase()).sort().join(',')] as const,

  // ── Rankings ─────────────────────────────────────────────────
  ranking: (category: string, limit: number, offset: number) =>
    ['ranking', category, limit, offset] as const,

  // ── Platform stats ───────────────────────────────────────────
  platformStats: () => ['platform-stats'] as const,

  // ── Token risk ───────────────────────────────────────────────
  tokenRisk: (poolAddress: string) =>
    ['token-risk', poolAddress.toLowerCase()] as const,

  // ── Token transactions ───────────────────────────────────────
  tokenTransactions: (poolAddress: string) =>
    ['token-transactions', poolAddress.toLowerCase()] as const,

  // ── Pool transactions with filter ──────────────────────────
  poolTransactions: (poolAddress: string, filter: string = 'all') =>
    ['pool-transactions', poolAddress.toLowerCase(), filter] as const,

  // ── Token holders ────────────────────────────────────────────
  tokenHolders: (poolAddress: string) =>
    ['token-holders', poolAddress.toLowerCase()] as const,

  // ── Candle stats (ATH/ATL) ───────────────────────────────────
  candleStats: (poolAddress: string) =>
    ['candle-stats', poolAddress.toLowerCase()] as const,

  // ── User profile ─────────────────────────────────────────────
  userProfile: (wallet: string) =>
    ['user-profile', wallet.toLowerCase()] as const,
} as const;
