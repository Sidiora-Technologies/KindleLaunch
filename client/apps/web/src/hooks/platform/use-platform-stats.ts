'use client';

import { useQuery } from '@tanstack/react-query';
import { dataApiUrl } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import { useRefetchOnAnyEvent } from '@/hooks/market/use-stream-refetch';

export interface PlatformStats {
  totalVolume24h: string;
  totalTokensLaunched: number;
  newTokens24h: number;
  uniqueTraders24h: number;
}

// Platform metrics are precomputed server-side (~25s) and aggregate everything,
// so they move slowly: ride the global firehose with a wide throttle + slow poll.
const BACKSTOP_MS = 90_000;

export function usePlatformStats(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;

  useRefetchOnAnyEvent({
    queryKeys: [queryKeys.platformStats()],
    throttleMs: 30_000,
    enabled,
  });

  return useQuery<PlatformStats | null>({
    queryKey: queryKeys.platformStats(),
    queryFn: async () => {
      const res = await fetch(dataApiUrl('/platform/metrics'));
      if (!res.ok) return null;
      return res.json();
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: BACKSTOP_MS,
    refetchIntervalInBackground: false,
  });
}
