'use client';

import { useState, useEffect } from 'react';
import { useWatchlist } from '@/hooks/ui/use-watchlist';
import { sdkBaseUrls } from '@/core/sdk-config';
import { fetchTokenMetadataBatch } from '@/core/clients/metadata';
import type { PoolStats, TokenMetadata } from './types';
import TokenCard from './token-card';

export default function WatchlistGrid() {
  const { list, toggle } = useWatchlist();
  const [batchStats, setBatchStats] = useState<Record<string, PoolStats>>({});
  const [batchMeta, setBatchMeta] = useState<Record<string, TokenMetadata>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (list.length === 0) { setBatchStats({}); setBatchMeta({}); return; }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    async function enrich() {
      try {
        const statsRes = await fetch(
          `${sdkBaseUrls.stats}/stats/batch?pools=${list.join(',')}`,
          { signal: controller.signal },
        );
        let statsData: Record<string, PoolStats> = {};
        if (statsRes.ok && !cancelled) {
          statsData = await statsRes.json();
          setBatchStats(statsData);
        }

        // Resolve pool → token addresses (fall back to the pool address
        // when stats hasn't surfaced the token yet).
        const tokenAddrs = list.map((poolAddr) =>
          statsData[poolAddr]?.tokenAddress || poolAddr,
        );

        // ONE batch request instead of N parallel fetches.
        const metaByToken = await fetchTokenMetadataBatch(
          tokenAddrs,
          controller.signal,
        );

        if (!cancelled) {
          const metaMap: Record<string, TokenMetadata> = {};
          list.forEach((addr, i) => {
            const meta = metaByToken[tokenAddrs[i].toLowerCase()];
            if (meta) metaMap[addr] = meta;
          });
          setBatchMeta(metaMap);
        }
      } catch {
        // Aborts and transient failures are non-fatal; React Query will
        // retry on next interval.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    enrich();
    const interval = setInterval(enrich, 30_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [list.join(',')]);

  if (list.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-dark-disabled text-size-13">
        Your watchlist is empty. Star tokens from the Explore tab to add them here.
      </div>
    );
  }

  if (loading && Object.keys(batchStats).length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 px-4">
        {Array.from({ length: list.length }).map((_, i) => (
          <div key={i} className="h-[130px] rounded-lg bg-dark-gray animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 px-4">
      {list.map((addr) => (
        <TokenCard
          key={addr}
          poolAddress={addr}
          meta={batchMeta[addr] ?? null}
          stats={batchStats[addr] ?? null}
          starred={true}
          onToggleStar={toggle}
        />
      ))}
    </div>
  );
}
