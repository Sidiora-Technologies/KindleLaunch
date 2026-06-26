'use client';

import { useMemo } from 'react';
import { useRanking } from '@/hooks/market/use-ranking';
import { useTokenStatsBatch } from '@/hooks/market/use-token-stats';
import { useTokenMetadataBatch } from '@/hooks/market/use-token-metadata';
import { usePlatformStats, type PlatformStats } from '@/hooks/platform/use-platform-stats';
import type { PoolStats, TokenMetadata, RankingItem } from './types';

// ── Public types ─────────────────────────────────────────────────────────────

export interface EnrichedToken {
  poolAddress: string;
  rank: number;
  meta: TokenMetadata | null;
  stats: PoolStats | null;
}

export interface BentoHeroData {
  trending: EnrichedToken[];
  topGainer: EnrichedToken | null;
  newest: EnrichedToken | null;
  platform: PlatformStats | null;
  loading: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function relativeAge(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function enrich(
  items: RankingItem[] | undefined,
  statsMap: Record<string, PoolStats> | undefined,
  metaByToken: Record<string, TokenMetadata | null>,
): EnrichedToken[] {
  if (!items?.length) return [];
  return items.map((item) => {
    const stats = statsMap?.[item.poolAddress] ?? null;
    const tokenAddr = (stats?.tokenAddress ?? item.poolAddress).toLowerCase();
    return {
      poolAddress: item.poolAddress,
      rank: item.rank,
      meta: metaByToken[tokenAddr] ?? null,
      stats,
    };
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Composes 4 ranking/platform queries + 1 stats-batch + 1 metadata-batch via
 * React Query. Every key is centralized so BentoHero, TrendingStrip, and
 * GlobalSearch all share the cache — at 100k+ users on the home page,
 * trending-data fires ONE network call across all three components, not
 * three. Live deltas ride the shared data-stream (push-first); the hooks keep a
 * slow visible-tab backstop poll internally.
 */
export function useBentoHero(): BentoHeroData {
  const trendingQuery = useRanking('trending', 8, 0);
  const moversQuery = useRanking('movers', 1, 0);
  const newQuery = useRanking('new', 1, 0);
  const platformQuery = usePlatformStats();

  // Combine all pool addresses we need stats for
  const allPools = useMemo(() => {
    const pools: string[] = [];
    trendingQuery.data?.items.forEach((i) => pools.push(i.poolAddress));
    moversQuery.data?.items.forEach((i) => pools.push(i.poolAddress));
    newQuery.data?.items.forEach((i) => pools.push(i.poolAddress));
    return [...new Set(pools.map((p) => p.toLowerCase()))];
  }, [trendingQuery.data, moversQuery.data, newQuery.data]);

  const statsBatch = useTokenStatsBatch(allPools);

  // Pull token addresses from stats so we can fetch their metadata in one batch
  const tokenAddrs = useMemo(() => {
    const set = new Set<string>();
    if (statsBatch.data) {
      Object.values(statsBatch.data).forEach((s) => {
        if (s?.tokenAddress) set.add(s.tokenAddress.toLowerCase());
      });
    }
    return [...set];
  }, [statsBatch.data]);

  const { data: metaByToken = {} } = useTokenMetadataBatch(tokenAddrs);

  const trending = useMemo(
    () => enrich(trendingQuery.data?.items, statsBatch.data, metaByToken),
    [trendingQuery.data, statsBatch.data, metaByToken],
  );
  const movers = useMemo(
    () => enrich(moversQuery.data?.items, statsBatch.data, metaByToken),
    [moversQuery.data, statsBatch.data, metaByToken],
  );
  const newPools = useMemo(
    () => enrich(newQuery.data?.items, statsBatch.data, metaByToken),
    [newQuery.data, statsBatch.data, metaByToken],
  );

  const loading =
    trendingQuery.isLoading || moversQuery.isLoading || newQuery.isLoading;

  return {
    trending,
    topGainer: movers[0] ?? null,
    newest: newPools[0] ?? null,
    platform: platformQuery.data ?? null,
    loading,
  };
}
