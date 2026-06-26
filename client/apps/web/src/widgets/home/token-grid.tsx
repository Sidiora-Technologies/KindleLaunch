'use client';

import { useState, useEffect, useMemo } from 'react';
import type { RankingCategory } from './category-tabs';
import type { TokenMetadata } from './types';
import { useWatchlist } from '@/hooks/ui/use-watchlist';
import { useRanking } from '@/hooks/market/use-ranking';
import { useTokenStatsBatch } from '@/hooks/market/use-token-stats';
import { getTokenMetadataBatch } from '@/hooks/market/use-token-metadata';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/query-keys';
import TokenCard from './token-card';
import { TokenGridSkeleton } from '@/ui/shared/skeletons';
import PremiumErrorBoundary from '@/ui/shared/premium-error-boundary';

const PAGE_SIZE = 40;

interface TokenGridProps {
  category: RankingCategory;
}

export default function TokenGrid({ category }: TokenGridProps) {
  const [page, setPage] = useState(0);
  const { toggle, check } = useWatchlist();

  useEffect(() => { setPage(0); }, [category]);

  const { data: rankingData, isLoading: loading, isFetching: fetching } = useRanking(
    category,
    PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const items = rankingData?.items ?? [];
  const total = rankingData?.total ?? 0;
  const poolAddrs = useMemo(() => items.map((i) => i.poolAddress), [items]);

  const { data: batchStats = {} } = useTokenStatsBatch(poolAddrs);

  // Metadata: derive token addresses from stats, then batch-fetch
  const tokenAddrs = useMemo(() => {
    return poolAddrs.map((p) => batchStats[p]?.tokenAddress || p);
  }, [poolAddrs, batchStats]);

  const { data: batchMeta = {} } = useQuery<Record<string, TokenMetadata | null>>({
    queryKey: queryKeys.tokenMetadataBatch(tokenAddrs),
    queryFn: () => getTokenMetadataBatch(tokenAddrs),
    enabled: tokenAddrs.length > 0,
    staleTime: 5 * 60_000,
  });

  // Map metadata back to pool addresses for component consumption
  const metaByPool = useMemo(() => {
    const map: Record<string, TokenMetadata> = {};
    poolAddrs.forEach((poolAddr) => {
      const tokenAddr = (batchStats[poolAddr]?.tokenAddress || poolAddr).toLowerCase();
      const meta = batchMeta[tokenAddr];
      if (meta) map[poolAddr] = meta;
    });
    return map;
  }, [poolAddrs, batchStats, batchMeta]);

  const hasMore = (page + 1) * PAGE_SIZE < total;

  if (loading) {
    return <TokenGridSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-dark-disabled text-size-13">
        No tokens found in this category.
      </div>
    );
  }

  return (
    <PremiumErrorBoundary area="token-grid">
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-4">
        {items.map((item) => (
          <TokenCard
            key={item.poolAddress}
            poolAddress={item.poolAddress}
            rank={item.rank}
            meta={metaByPool[item.poolAddress] ?? null}
            stats={batchStats[item.poolAddress] ?? null}
            starred={check(item.poolAddress)}
            onToggleStar={toggle}
          />
        ))}
      </div>

      {(total > PAGE_SIZE) && (
        <div className="flex items-center justify-center gap-3 mt-4 px-4 pb-4">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-3 py-1 rounded-lg bg-dark-gray2 text-size-11 text-half-enabled disabled:opacity-30 disabled:cursor-not-allowed hover:bg-dark-gray7 transition"
          >
            Prev
          </button>
          <span className="text-size-11 text-dark-disabled">
            Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded-lg bg-dark-gray2 text-size-11 text-half-enabled disabled:opacity-30 disabled:cursor-not-allowed hover:bg-dark-gray7 transition"
          >
            Next
          </button>
          {fetching && (
            <span className="text-size-10 text-dark-disabled animate-pulse">Loading...</span>
          )}
        </div>
      )}
    </div>
    </PremiumErrorBoundary>
  );
}
