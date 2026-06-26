'use client';

import { useQuery } from '@tanstack/react-query';
import { sdkBaseUrls } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import { cachePolicy } from '@/core/cache-policy';
import type { PoolStats } from '@/widgets/home/types';

/**
 * Fetches pool stats for a single pool. TanStack Query deduplicates calls
 * across all components using the same poolAddress.
 *
 * Polls every `refetchInterval` ms (default 10s) when the tab is visible.
 */
export function useTokenStats(
  poolAddress: string | undefined | null,
  opts?: { refetchInterval?: number; enabled?: boolean },
) {
  const interval = opts?.refetchInterval ?? 10_000;

  return useQuery<PoolStats | null>({
    queryKey: queryKeys.tokenStats(poolAddress ?? ''),
    queryFn: async () => {
      if (!poolAddress) return null;
      const res = await fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: (opts?.enabled ?? true) && !!poolAddress,
    // REALTIME: WS stream is primary; this REST poll is the freshness backstop.
    ...cachePolicy.REALTIME,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
  });
}

/**
 * Batch-fetch stats for many pools in one request.
 * Used by home grids / trending strip.
 */
export function useTokenStatsBatch(
  pools: string[],
  opts?: { refetchInterval?: number; enabled?: boolean },
) {
  const interval = opts?.refetchInterval ?? 30_000;

  return useQuery<Record<string, PoolStats>>({
    queryKey: queryKeys.tokenStatsBatch(pools),
    queryFn: async () => {
      if (pools.length === 0) return {};
      const res = await fetch(
        `${sdkBaseUrls.stats}/stats/batch?pools=${pools.join(',')}`,
      );
      if (!res.ok) return {};
      return res.json();
    },
    enabled: (opts?.enabled ?? true) && pools.length > 0,
    // FAST: home/trending aggregates — slightly looser than a single live pool.
    ...cachePolicy.FAST,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
  });
}
