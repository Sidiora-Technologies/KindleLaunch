'use client';

import { useQuery } from '@tanstack/react-query';
import { dataApiUrl } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import { useRefetchOnAnyEvent } from '@/hooks/market/use-stream-refetch';
import { DataChannels } from '@/core/realtime/data-stream';
import type { RankingsResponse } from '@/widgets/home/types';

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

  // Push-first: ranking-algo publishes rankings_update when a category is
  // recomputed; re-validate on it (no background poll).
  useRefetchOnAnyEvent({
    queryKeys: [['ranking', category]],
    channels: [DataChannels.RankingsUpdate],
    enabled,
  });

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
  });
}
