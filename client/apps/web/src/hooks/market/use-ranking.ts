'use client';

import { useQuery } from '@tanstack/react-query';
import { dataApiUrl } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import { useRefetchOnAnyEvent } from '@/hooks/market/use-stream-refetch';
import type { RankingsResponse } from '@/widgets/home/types';

// Rankings have no dedicated push channel — ordering shifts as swaps land, so we
// throttle-invalidate on the global swap firehose and keep a slow poll backstop.
const BACKSTOP_MS = 90_000;

/**
 * Fetch ranking list for a given category with pagination.
 * Push-first: the global swap firehose throttle-invalidates the list.
 */
export function useRanking(
  category: string,
  limit: number,
  offset: number,
  opts?: { enabled?: boolean },
) {
  const enabled = opts?.enabled ?? true;

  useRefetchOnAnyEvent({ queryKeys: [['ranking', category]], enabled });

  return useQuery<RankingsResponse | null>({
    queryKey: queryKeys.ranking(category, limit, offset),
    queryFn: async () => {
      const res = await fetch(
        dataApiUrl(`/rankings/${category}?limit=${limit}&offset=${offset}`),
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: BACKSTOP_MS,
    refetchIntervalInBackground: false,
  });
}
