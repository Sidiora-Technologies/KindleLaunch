'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRanking } from '@/hooks/market/use-ranking';
import { useTokenStatsBatch } from '@/hooks/market/use-token-stats';
import { useTokenMetadataBatch } from '@/hooks/market/use-token-metadata';
import { sdkBaseUrls } from '@/core/sdk-config';
import { explorerSearch } from '@/core/clients/explorer-api';
import { reportError } from '@/core/report-error';
import { useDebouncedValue } from '@/hooks/ui/use-debounced-value';


const RECENT_KEY = 'sidiora_recent_viewed';
const MAX_RECENT = 6;

export interface SearchResult {
  token_address?: string;
  pool_address?: string;
  name?: string;
  symbol?: string;
  images?: { logo?: string | null };
  marketCap?: string;
}

export interface HotCoin {
  poolAddress: string;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  logo?: string | null;
  marketCap?: string;
}

export interface RecentItem {
  address: string;
  name: string;
  symbol: string;
  logo: string | null;
  marketCap: string;
  ts: number;
}

// ── Recent storage helpers ────────────────────────────────────────────────────

export function loadRecent(): RecentItem[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

export function saveRecent(items: RecentItem[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT))); } catch {}
}

export function addToRecent(item: RecentItem) {
  const existing = loadRecent().filter(r => r.address.toLowerCase() !== item.address.toLowerCase());
  saveRecent([{ ...item, ts: Date.now() }, ...existing]);
}

export function clearRecentStorage() {
  try { localStorage.removeItem(RECENT_KEY); } catch {}
}

export function relAge(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Hot coins (shares trending cache with BentoHero/TrendingStrip) ───────────

export function useHotCoins(limit = 8): { coins: HotCoin[]; loading: boolean } {
  const trending = useRanking('trending', limit, 0, { refetchInterval: 60_000 });

  const items = trending.data?.items ?? [];
  const pools = useMemo(
    () => items.map((i) => i.poolAddress.toLowerCase()),
    [items],
  );

  const statsBatch = useTokenStatsBatch(pools, { refetchInterval: 30_000 });

  const tokenAddrs = useMemo(() => {
    if (!statsBatch.data) return [];
    return [...new Set(
      Object.values(statsBatch.data)
        .map((s) => s?.tokenAddress?.toLowerCase())
        .filter((a): a is string => !!a),
    )];
  }, [statsBatch.data]);

  const { data: metaByToken = {} } = useTokenMetadataBatch(tokenAddrs);

  const coins = useMemo<HotCoin[]>(() => {
    return items.map((item) => {
      const stat = statsBatch.data?.[item.poolAddress];
      const tokenAddr = (stat?.tokenAddress || '').toLowerCase();
      const meta = metaByToken[tokenAddr];
      return {
        poolAddress: item.poolAddress,
        tokenAddress: tokenAddr,
        name: meta?.name || '',
        symbol: meta?.symbol || '',
        logo: meta?.images?.logo || null,
        marketCap: stat?.marketCap || '0',
      };
    });
  }, [items, statsBatch.data, metaByToken]);

  return { coins, loading: trending.isLoading };
}

// ── Search results (debounced + cached via React Query) ──────────────────────

async function fetchSearchResults(query: string): Promise<SearchResult[]> {
  const isAddress = query.startsWith('0x') && query.length >= 10;
  const combined: SearchResult[] = [];

  if (isAddress) {
    const res = await fetch(`${sdkBaseUrls.metadata}/metadata/${query}.json`);
    if (res.ok) {
      const d = await res.json();
      if (d) combined.push(d);
    }
  } else {
    const [metaRes, explorerResults] = await Promise.all([
      fetch(`${sdkBaseUrls.metadata}/tokens/search?q=${encodeURIComponent(query)}&limit=6`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
      explorerSearch(query),
    ]);

    const metaItems: SearchResult[] = Array.isArray(metaRes) ? metaRes : metaRes.results ?? metaRes.tokens ?? [];
    combined.push(...metaItems);

    const existingAddrs = new Set(combined.map(r => (r.pool_address || r.token_address || '').toLowerCase()));
    for (const ex of explorerResults) {
      if (ex.type !== 'token') continue;
      const addr = ex.address_hash || ex.address || '';
      if (existingAddrs.has(addr.toLowerCase())) continue;
      combined.push({
        token_address: addr,
        name: ex.name || undefined,
        symbol: ex.symbol || undefined,
        images: { logo: ex.icon_url || null },
      });
      if (combined.length >= 10) break;
    }
  }

  // Resolve missing pool_address per result. With React Query caching, identical
  // metadata addresses across results are deduplicated by key + staleTime — this
  // is the scalability fix for #10 (search resolve loop).
  await Promise.all(
    combined.map(async (r) => {
      if (r.pool_address || !r.token_address) return;
      try {
        const res = await fetch(`${sdkBaseUrls.metadata}/metadata/${r.token_address}.json`);
        if (res.ok) {
          const meta = await res.json();
          if (meta?.pool_address) r.pool_address = meta.pool_address;
        }
      } catch (error) {
        reportError(error, { area: 'global-search', action: 'resolvePoolAddress' });
      }
    }),
  );

  return combined;
}

export function useSearchResults(query: string) {
  const debouncedQuery = useDebouncedValue(query, 300);
  return useQuery<SearchResult[]>({
    queryKey: ['global-search', debouncedQuery],
    queryFn: () => fetchSearchResults(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });
}

// ── Recent viewed state ───────────────────────────────────────────────────────

export function useRecentViewed() {
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const refresh = () => setRecent(loadRecent());
  const clear = () => { clearRecentStorage(); setRecent([]); };
  const push = (item: RecentItem) => {
    addToRecent(item);
    refresh();
  };

  return { recent, refresh, clear, push };
}
