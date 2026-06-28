'use client';

import { useQuery } from '@tanstack/react-query';
import { dataApiUrl } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import { cachePolicy } from '@/core/cache-policy';
import { useRefetchOnPoolEvent, useRefetchOnAnyEvent } from '@/hooks/market/use-stream-refetch';
import { DataChannels } from '@/core/realtime/data-stream';
import type { PoolStats } from '@/widgets/home/types';

// Push-first: the dedicated `stats_update` channel (plus swap / pool_state_updated
// as a recompute hint) re-validates the snapshot. There is NO background poll —
// the stream is the freshness mechanism, and invalidateQueries only refetches
// queries that are currently mounted, so cost stays bounded at 500K.

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
    channels: [DataChannels.StatsUpdate, DataChannels.Swap, DataChannels.PoolStateUpdated],
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
    // REALTIME: WS stream is the sole freshness mechanism; no background poll.
    ...cachePolicy.REALTIME,
    refetchInterval: false,
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
    channels: [DataChannels.StatsUpdate],
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
    // FAST: home/trending aggregates — re-validated by the stats_update firehose.
    ...cachePolicy.FAST,
    refetchInterval: false,
  });
}
