'use client';

import { useQuery } from '@tanstack/react-query';
import { dataApiUrl } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import { useRefetchOnAnyEvent } from '@/hooks/market/use-stream-refetch';
import { DataChannels } from '@/core/realtime/data-stream';

export interface PlatformStats {
  totalVolume24h: string;
  totalTokensLaunched: number;
  newTokens24h: number;
  uniqueTraders24h: number;
}

export function usePlatformStats(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;

  // Push-first: stats-workers publishes platform_update after each precompute;
  // re-validate on it (no background poll).
  useRefetchOnAnyEvent({
    queryKeys: [queryKeys.platformStats()],
    channels: [DataChannels.PlatformUpdate],
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
  });
}
