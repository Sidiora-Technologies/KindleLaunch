'use client';

import { useQuery } from '@tanstack/react-query';
import { sdkBaseUrls } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import type { RankingsResponse } from '@/widgets/home/types';

/**
 * Fetch ranking list for a given category with pagination.
 * Polls when the tab is visible.
 */
export function useRanking(
  category: string,
  limit: number,
  offset: number,
  opts?: { refetchInterval?: number; enabled?: boolean },
) {
  const interval = opts?.refetchInterval ?? 30_000;

  return useQuery<RankingsResponse | null>({
    queryKey: queryKeys.ranking(category, limit, offset),
    queryFn: async () => {
      const res = await fetch(
        `${sdkBaseUrls.ranking}/rankings/${category}?limit=${limit}&offset=${offset}`,
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: opts?.enabled ?? true,
    staleTime: 10_000,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
  });
}
