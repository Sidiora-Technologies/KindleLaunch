'use client';

import { useQuery } from '@tanstack/react-query';
import { dataApiUrl } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import { cachePolicy } from '@/core/cache-policy';
import { useRefetchOnPoolEvent, useRefetchOnAnyEvent } from '@/hooks/market/use-stream-refetch';
import type { PoolStats } from '@/widgets/home/types';

// Push is primary (core/api `/ws` swap + pool_state_updated deltas re-validate
// the snapshot). These long, visible-tab-only backstops only self-heal a missed
// event — they are NOT the freshness mechanism, so they stay slow at 500K.
const BACKSTOP_SINGLE_MS = 60_000;
const BACKSTOP_BATCH_MS = 90_000;

/**
 * Fetches pool stats for a single pool. TanStack Query deduplicates calls
 * across all components using the same poolAddress.
 *
 * Push-first: a swap / pool_state_updated delta for this pool throttle-invalidates
 * the snapshot. The slow background poll is only a missed-event backstop.
 */
export function useTokenStats(
  poolAddress: string | undefined | null,
  opts?: { enabled?: boolean },
) {
  const enabled = (opts?.enabled ?? true) && !!poolAddress;

  // Re-validate on live deltas (swap + pool_state_updated) for this pool.
  useRefetchOnPoolEvent({
    poolAddress,
    queryKeys: [queryKeys.tokenStats(poolAddress ?? '')],
    enabled,
  });

  return useQuery<PoolStats | null>({
    queryKey: queryKeys.tokenStats(poolAddress ?? ''),
    queryFn: async () => {
      if (!poolAddress) return null;
      const res = await fetch(dataApiUrl(`/stats/${poolAddress}`));
      if (!res.ok) return null;
      return res.json();
    },
    enabled,
    // REALTIME: WS stream is primary; this REST poll is the freshness backstop.
    ...cachePolicy.REALTIME,
    refetchInterval: BACKSTOP_SINGLE_MS,
    refetchIntervalInBackground: false,
  });
}

/**
 * Batch-fetch stats for many pools in one request.
 * Used by home grids / trending strip.
 *
 * Push-first: rides the global swap firehose and throttle-invalidates the batch
 * snapshot (wide throttle, since this aggregates all pools). Slow poll backstop.
 */
export function useTokenStatsBatch(
  pools: string[],
  opts?: { enabled?: boolean },
) {
  const enabled = (opts?.enabled ?? true) && pools.length > 0;

  useRefetchOnAnyEvent({
    queryKeys: [queryKeys.tokenStatsBatch(pools)],
    enabled,
  });

  return useQuery<Record<string, PoolStats>>({
    queryKey: queryKeys.tokenStatsBatch(pools),
    queryFn: async () => {
      if (pools.length === 0) return {};
      const res = await fetch(dataApiUrl(`/stats/batch?pools=${pools.join(',')}`));
      if (!res.ok) return {};
      return res.json();
    },
    enabled,
    // FAST: home/trending aggregates — slightly looser than a single live pool.
    ...cachePolicy.FAST,
    refetchInterval: BACKSTOP_BATCH_MS,
    refetchIntervalInBackground: false,
  });
}
