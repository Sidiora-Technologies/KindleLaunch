'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWatchlist } from '@/hooks/ui/use-watchlist';
import { dataApiUrl } from '@/core/sdk-config';
import { fetchTokenMetadataBatch } from '@/core/clients/metadata';
import { useReloadOnAnyEvent } from '@/hooks/market/use-stream-refetch';
import type { PoolStats, TokenMetadata } from './types';
import TokenCard from './token-card';

export default function WatchlistGrid() {
  const { list, toggle } = useWatchlist();
  const [batchStats, setBatchStats] = useState<Record<string, PoolStats>>({});
  const [batchMeta, setBatchMeta] = useState<Record<string, TokenMetadata>>({});
  const [loading, setLoading] = useState(false);

  const listKey = list.join(',');

  const enrich = useCallback(async () => {
    if (list.length === 0) { setBatchStats({}); setBatchMeta({}); return; }
    try {
      const statsRes = await fetch(dataApiUrl(`/stats/batch?pools=${list.join(',')}`));
      let statsData: Record<string, PoolStats> = {};
      if (statsRes.ok) {
        statsData = await statsRes.json();
        setBatchStats(statsData);
      }

      // Resolve pool → token addresses (fall back to the pool address
      // when stats hasn't surfaced the token yet).
      const tokenAddrs = list.map((poolAddr) =>
        statsData[poolAddr]?.tokenAddress || poolAddr,
      );

      // ONE batch request instead of N parallel fetches.
      const metaByToken = await fetchTokenMetadataBatch(tokenAddrs);
      const metaMap: Record<string, TokenMetadata> = {};
      list.forEach((addr, i) => {
        const meta = metaByToken[tokenAddrs[i].toLowerCase()];
        if (meta) metaMap[addr] = meta;
      });
      setBatchMeta(metaMap);
    } catch {
      // Transient failures are non-fatal; the next push delta re-enriches.
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  // Initial snapshot.
  useEffect(() => {
    if (list.length === 0) { setBatchStats({}); setBatchMeta({}); return; }
    setLoading(true);
    void enrich();
  }, [enrich, list.length]);

  // Push-first: re-enrich on the global swap firehose (replaces the 30s timer).
  useReloadOnAnyEvent(enrich, { enabled: list.length > 0 });

  if (list.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-dark-disabled text-size-13">
        Your watchlist is empty. Star tokens from the Explore tab to add them here.
      </div>
    );
  }

  if (loading && Object.keys(batchStats).length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-4">
        {Array.from({ length: list.length }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-xl bg-black-gray2 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-4">
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
