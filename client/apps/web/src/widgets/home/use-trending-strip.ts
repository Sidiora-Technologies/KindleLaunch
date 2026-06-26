'use client';

import { useEffect, useMemo, useRef, useState, useCallback, type RefObject } from 'react';
import { useRanking } from '@/hooks/market/use-ranking';
import { useTokenStatsBatch } from '@/hooks/market/use-token-stats';
import { useTokenMetadataBatch } from '@/hooks/market/use-token-metadata';
import type { TokenMetadata } from './types';

export interface TrendingCard {
  poolAddress: string;
  rank: number;
  meta: TokenMetadata | null;
  marketCap: string;
  price_change_24h: number;
  volume_24h_raw: string;
  price?: string;
}

export interface UseTrendingStripResult {
  cards: TrendingCard[];
  loading: boolean;
  flashKeys: Record<string, number>;
  litPools: Set<string>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  scroll: (dir: 'left' | 'right') => void;
}

const FLASH_DURATION_MS = 2500;

/**
 * Composes useRanking + useTokenStatsBatch + useTokenMetadataBatch via React Query.
 * Shares cache with BentoHero / GlobalSearch for the trending list.
 *
 * Watches `price` between batch refetches to detect upward moves and triggers
 * a brief "BUY" flash on the corresponding card. Cards that flashed are reordered
 * to the front.
 */
export function useTrendingStrip(limit = 8): UseTrendingStripResult {
  const trendingQuery = useRanking('trending', limit, 0);

  const items = trendingQuery.data?.items ?? [];
  const pools = useMemo(
    () => items.map((i) => i.poolAddress.toLowerCase()),
    [items],
  );

  // BUY flashes are now driven by push: the swap firehose throttle-invalidates the
  // shared batch-stats key (same key as BentoHero, so the refresh is shared).
  const statsBatch = useTokenStatsBatch(pools);

  const tokenAddrs = useMemo(() => {
    if (!statsBatch.data) return [];
    return [...new Set(
      Object.values(statsBatch.data)
        .map((s) => s?.tokenAddress?.toLowerCase())
        .filter((a): a is string => !!a),
    )];
  }, [statsBatch.data]);

  const { data: metaByToken = {} } = useTokenMetadataBatch(tokenAddrs);

  // Live cards (sortable for buy-flash reorder)
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const [flashKeys, setFlashKeys] = useState<Record<string, number>>({});
  const [litPools, setLitPools] = useState<Set<string>>(new Set());
  const litTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const prevPrice = useRef<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const baseCards = useMemo<TrendingCard[]>(() => {
    if (items.length === 0) return [];
    return items.map((item) => {
      const stat = statsBatch.data?.[item.poolAddress];
      const tokenAddr = (stat?.tokenAddress ?? '').toLowerCase();
      return {
        poolAddress: item.poolAddress,
        rank: item.rank,
        meta: metaByToken[tokenAddr] ?? null,
        marketCap: stat?.marketCap || item.stats?.marketCap || '0',
        price_change_24h: item.stats?.priceChange24h ? parseFloat(item.stats.priceChange24h) : 0,
        volume_24h_raw: item.stats?.volume24h || '0',
        price: stat?.price,
      };
    });
  }, [items, statsBatch.data, metaByToken]);

  // Apply override ordering (reordering when buy flashes fire)
  const cards = useMemo<TrendingCard[]>(() => {
    if (!orderOverride) return baseCards;
    const map = new Map(baseCards.map((c) => [c.poolAddress.toLowerCase(), c]));
    const ordered: TrendingCard[] = [];
    orderOverride.forEach((addr) => {
      const c = map.get(addr);
      if (c) { ordered.push(c); map.delete(addr); }
    });
    return [...ordered, ...map.values()];
  }, [baseCards, orderOverride]);

  // Detect price increases between stats refetches → trigger buy-flash
  useEffect(() => {
    if (!statsBatch.data) return;
    const updates: string[] = [];
    Object.entries(statsBatch.data).forEach(([addr, stat]) => {
      if (!stat?.price) return;
      const key = addr.toLowerCase();
      const prev = prevPrice.current[key];
      if (prev !== undefined && stat.price !== prev) {
        const isUp = parseFloat(stat.price) >= parseFloat(prev);
        if (isUp) updates.push(key);
      }
      prevPrice.current[key] = stat.price;
    });

    if (updates.length === 0) return;

    setFlashKeys((prev) => {
      const next = { ...prev };
      updates.forEach((k) => { next[k] = (next[k] ?? 0) + 1; });
      return next;
    });
    setLitPools((prev) => {
      const next = new Set(prev);
      updates.forEach((k) => next.add(k));
      return next;
    });
    updates.forEach((k) => {
      if (litTimers.current[k]) clearTimeout(litTimers.current[k]);
      litTimers.current[k] = setTimeout(() => {
        setLitPools((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      }, FLASH_DURATION_MS);
    });

    // Move flashed pools to front
    setOrderOverride((prev) => {
      const current = prev ?? baseCards.map((c) => c.poolAddress.toLowerCase());
      const remaining = current.filter((a) => !updates.includes(a));
      return [...updates, ...remaining];
    });

    scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [statsBatch.data, baseCards]);

  useEffect(() => () => {
    Object.values(litTimers.current).forEach(clearTimeout);
  }, []);

  const scroll = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
  }, []);

  return {
    cards,
    loading: trendingQuery.isLoading,
    flashKeys,
    litPools,
    scrollRef,
    scroll,
  };
}
