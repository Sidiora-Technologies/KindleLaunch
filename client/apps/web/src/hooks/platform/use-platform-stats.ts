'use client';

import { useQuery } from '@tanstack/react-query';
import { sdkBaseUrls } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';

export interface PlatformStats {
  totalVolume24h: string;
  totalTokensLaunched: number;
  newTokens24h: number;
  uniqueTraders24h: number;
}

export function usePlatformStats(opts?: { refetchInterval?: number }) {
  const interval = opts?.refetchInterval ?? 60_000;

  return useQuery<PlatformStats | null>({
    queryKey: queryKeys.platformStats(),
    queryFn: async () => {
      const res = await fetch(`${sdkBaseUrls.stats}/stats/platform`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
  });
}
