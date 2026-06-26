'use client';

import { create } from 'zustand';
import { sdkBaseUrls } from '@/core/sdk-config';
import { fetchTokenHolders, fetchTokenCounters } from '@/core/clients/paxscan';
import { fetchTokenMetadataBatch } from '@/core/clients/metadata';

export interface PoolStats {
  poolAddress: string;
  tokenAddress: string;
  price: string;
  priceChange1m?: string;
  priceChange5m?: string;
  priceChange15m?: string;
  priceChange1h?: string;
  priceChange24h: string;
  priceChangeDollar1m?: string;
  priceChangeDollar5m?: string;
  priceChangeDollar15m?: string;
  priceChangeDollar1h?: string;
  priceChangeDollar24h?: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  volume1h: string;
  volume5m: string;
  marketCap: string;
  buyCount24h: number;
  sellCount24h: number;
  uniqueTraders24h: number;
  holderCount: number;
  top10Concentration: string;
  creatorHoldingsPct: string;
  riskRating: number;
  riskFactors: string;
  createdAt: number;
  updatedAt: number;
}

export interface PoolTransaction {
  id: string;
  poolAddress: string;
  sender: string;
  isBuy: boolean;
  amountIn: string;
  amountOut: string;
  price: string;
  fee: string;
  blockTimestamp: number;
  txHash: string;
}

export interface PoolHolder {
  address: string;
  isContract: boolean;
  balance: string;
  balanceFormatted: number;
  pctOfSupply: number;
}

export interface TokenMetadata {
  token_address?: string;
  pool_address?: string;
  name?: string;
  symbol?: string;
  description?: string;
  creator?: string;
  images?: { logo?: string | null; banner?: string | null };
}

export interface RankingItem {
  poolAddress: string;
  score: number;
  rank: number;
  stats?: {
    price: string;
    priceChange1m?: string;
    priceChange5m?: string;
    priceChange15m?: string;
    priceChange1h?: string;
    priceChange24h?: string;
    priceChangeDollar1m?: string;
    priceChangeDollar5m?: string;
    priceChangeDollar15m?: string;
    priceChangeDollar1h?: string;
    priceChangeDollar24h?: string;
    volume24h?: string;
    volume1h?: string;
    volume5m?: string;
    marketCap?: string;
    holderCount?: number;
  };
}

interface TerminalState {
  // Selected pool
  selectedPool: string | null;
  selectPool: (pool: string) => void;

  // Pool stats
  stats: PoolStats | null;
  statsLoading: boolean;
  fetchStats: () => Promise<void>;

  // Transactions
  transactions: PoolTransaction[];
  txLoading: boolean;
  fetchTransactions: () => Promise<void>;

  // Holders (from Paxscan)
  holders: PoolHolder[];
  holderCount: number;
  derivedTop10Conc: number;
  derivedCreatorPct: number;
  holdersLoading: boolean;
  fetchHolders: () => Promise<void>;

  // Metadata
  metadata: TokenMetadata | null;
  metadataLoading: boolean;
  fetchMetadata: () => Promise<void>;

  // Rankings (for left panel)
  trendingTokens: RankingItem[];
  rankingLoading: boolean;
  fetchRankings: () => Promise<void>;

  // Batch stats for ranking items
  batchStats: Record<string, PoolStats>;
  fetchBatchStats: (pools: string[]) => Promise<void>;

  // Batch metadata for ranking items
  batchMetadata: Record<string, TokenMetadata>;
  fetchBatchMetadata: (tokens: string[]) => Promise<void>;

  // Polling control
  startPolling: () => void;
  stopPolling: () => void;
  _pollInterval: ReturnType<typeof setInterval> | null;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  selectedPool: null,
  stats: null,
  statsLoading: false,
  transactions: [],
  txLoading: false,
  holders: [],
  holderCount: 0,
  derivedTop10Conc: 0,
  derivedCreatorPct: 0,
  holdersLoading: false,
  metadata: null,
  metadataLoading: false,
  trendingTokens: [],
  rankingLoading: false,
  batchStats: {},
  batchMetadata: {},
  _pollInterval: null,

  selectPool: (pool: string) => {
    set({ selectedPool: pool, stats: null, transactions: [], holders: [], holderCount: 0, derivedTop10Conc: 0, derivedCreatorPct: 0, metadata: null });
    // Fetch all data for new pool
    get().fetchStats();
    get().fetchTransactions();
    get().fetchHolders();
    get().fetchMetadata();
  },

  fetchStats: async () => {
    const pool = get().selectedPool;
    if (!pool) return;
    set({ statsLoading: true });
    try {
      const res = await fetch(`${sdkBaseUrls.stats}/stats/${pool}`);
      if (res.ok) {
        const data = await res.json();
        set({ stats: data });
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      set({ statsLoading: false });
    }
  },

  fetchTransactions: async () => {
    const pool = get().selectedPool;
    if (!pool) return;
    set({ txLoading: true });
    try {
      const res = await fetch(`${sdkBaseUrls.stats}/stats/${pool}/transactions?limit=50`);
      if (res.ok) {
        const data = await res.json();
        set({ transactions: data.transactions || [] });
      }
    } catch (e) {
      console.error('Failed to fetch transactions:', e);
    } finally {
      set({ txLoading: false });
    }
  },

  fetchHolders: async () => {
    const stats = get().stats;
    const tokenAddr = stats?.tokenAddress;
    if (!tokenAddr) return;
    set({ holdersLoading: true });
    try {
      const [counters, holdersRes] = await Promise.all([
        fetchTokenCounters(tokenAddr),
        fetchTokenHolders(tokenAddr, 50),
      ]);

      const totalSupply = holdersRes.holders.reduce((s, h) => s + h.balanceFormatted, 0);
      const top10Sum = holdersRes.holders.slice(0, 10).reduce((s, h) => s + h.balanceFormatted, 0);
      const top10Pct = totalSupply > 0 ? (top10Sum / totalSupply) * 100 : 0;

      const metadata = get().metadata;
      const creator = metadata?.creator?.toLowerCase();
      let creatorPct = 0;
      if (creator && totalSupply > 0) {
        const ch = holdersRes.holders.find(h => h.address.toLowerCase() === creator);
        if (ch) creatorPct = (ch.balanceFormatted / totalSupply) * 100;
      }

      const holders: PoolHolder[] = holdersRes.holders.map(h => ({
        address: h.address,
        isContract: h.isContract,
        balance: h.balance,
        balanceFormatted: h.balanceFormatted,
        pctOfSupply: h.pctOfSupply,
      }));

      set({
        holders,
        holderCount: counters.holderCount,
        derivedTop10Conc: top10Pct,
        derivedCreatorPct: creatorPct,
      });
    } catch (e) {
      console.error('Failed to fetch holders from Paxscan:', e);
    } finally {
      set({ holdersLoading: false });
    }
  },

  fetchMetadata: async () => {
    const stats = get().stats;
    const pool = get().selectedPool;
    if (!pool) return;
    set({ metadataLoading: true });
    try {
      const tokenAddr = stats?.tokenAddress || pool;
      const res = await fetch(`${sdkBaseUrls.metadata}/metadata/${tokenAddr}.json`);
      if (res.ok) {
        const data = await res.json();
        set({ metadata: data });
      } else {
        // Try legacy endpoint
        const res2 = await fetch(`${sdkBaseUrls.metadata}/metadata/${tokenAddr}`);
        if (res2.ok) {
          const data = await res2.json();
          set({ metadata: { token_address: tokenAddr, images: data.images } });
        }
      }
    } catch (e) {
      console.error('Failed to fetch metadata:', e);
    } finally {
      set({ metadataLoading: false });
    }
  },

  fetchRankings: async () => {
    set({ rankingLoading: true });
    try {
      const res = await fetch(`${sdkBaseUrls.ranking}/rankings/trending?limit=20`);
      if (res.ok) {
        const data = await res.json();
        const items: RankingItem[] = data.items || [];
        set({ trendingTokens: items });

        // Fetch batch stats for all ranking pools
        const pools = items.map((i) => i.poolAddress).filter(Boolean);
        if (pools.length > 0) {
          get().fetchBatchStats(pools);
        }
      }
    } catch (e) {
      console.error('Failed to fetch rankings:', e);
    } finally {
      set({ rankingLoading: false });
    }
  },

  fetchBatchStats: async (pools: string[]) => {
    try {
      const res = await fetch(`${sdkBaseUrls.stats}/stats/batch?pools=${pools.join(',')}`);
      if (res.ok) {
        const data = await res.json();
        set({ batchStats: data });

        // Also fetch metadata for tokens in batch stats
        const tokenAddrs = Object.values(data as Record<string, PoolStats>)
          .map((s) => s.tokenAddress)
          .filter(Boolean);
        if (tokenAddrs.length > 0) {
          get().fetchBatchMetadata(tokenAddrs);
        }
      }
    } catch (e) {
      console.error('Failed to fetch batch stats:', e);
    }
  },

  fetchBatchMetadata: async (tokens: string[]) => {
    if (tokens.length === 0) return;
    // ONE batch request via the metadata client. Falls back to per-token
    // fetches automatically if the server is older than the batch deploy.
    const data = await fetchTokenMetadataBatch(tokens);
    // Re-key onto the original (case-preserved) address strings so callers
    // looking up by their original input still find a hit.
    const results: Record<string, TokenMetadata> = {};
    for (const addr of tokens) {
      const meta = data[addr.toLowerCase()];
      if (meta) results[addr] = meta as TokenMetadata;
    }
    set((state) => ({ batchMetadata: { ...state.batchMetadata, ...results } }));
  },

  startPolling: () => {
    get().stopPolling();
    // Refresh stats + transactions + holders every 10s
    const interval = setInterval(() => {
      get().fetchStats();
      get().fetchTransactions();
      get().fetchHolders();
    }, 10_000);
    set({ _pollInterval: interval });
  },

  stopPolling: () => {
    const interval = get()._pollInterval;
    if (interval) {
      clearInterval(interval);
      set({ _pollInterval: null });
    }
  },
}));
