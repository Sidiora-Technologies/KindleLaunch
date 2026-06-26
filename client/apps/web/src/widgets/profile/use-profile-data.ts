'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useReadContracts } from 'wagmi';
import { sdkBaseUrls } from '@/core/sdk-config';
import { fetchTokenMetadataBatch } from '@/core/clients/metadata';
import { formatAddress } from '@/utils/format';
import { queryKeys } from '@/core/query-keys';
import {
  fetchAddressCounters,
  fetchAddressTransactions,
  fetchAddressTokenTransfers,
  type AddressCounters,
  type ExplorerTransaction,
  type ExplorerTokenTransfer,
} from '@/core/clients/explorer-api';
import {
  FEES_ROUTER_ADDRESS,
  ERC721_ENUMERABLE_ABI,
  useReadFeesRouterNftContract,
  useReadQuoterGetPoolsByCreator,
} from '@/core/network/contracts';
import FeesRouterAbi from '@/core/network/abis/FeesRouter.json';

export const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;

// ── Types ─────────────────────────────────────────────────────

export interface UserProfile {
  wallet_address: string;
  display_name?: string | null;
  bio?: string | null;
  socials?: {
    twitter?: string | null;
    telegram?: string | null;
    discord?: string | null;
    website?: string | null;
  };
  avatar_url?: string | null;
  created_pools?: { poolAddress: string; tokenAddress: string; createdAt: number }[];
  created_at?: number | null;
  updated_at?: number | null;
}

export interface CreatedCoinDisplay {
  poolAddress: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  logo: string | null;
  marketCap: string;
}

export interface WalletBalanceItem {
  token: {
    address_hash: string;
    decimals: string;
    exchange_rate: string;
    icon_url: string | null;
    name: string;
    symbol: string;
  };
  value: string;
}

export interface RewardPoolMeta {
  name: string;
  symbol: string;
  logo: string | null;
  poolAddress: string;
  tokenAddress: string;
  marketCap: string;
  volume24h: string;
}

export interface PublicRewardItem {
  nftId: bigint;
  claimable: bigint;
  pool: RewardPoolMeta | null;
}

export type ProfileTab = 'balances' | 'positions' | 'coins' | 'rewards' | 'referrals' | 'activity';
export type ActivitySubTab = 'transactions' | 'transfers';

// ── Helpers ────────────────────────────────────────────────────

export function buildDmConversationId(a: string, b: string): string {
  const sorted = [a.toLowerCase(), b.toLowerCase()].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

export function relativeAge(ts: string | number): string {
  const sec = typeof ts === 'number' ? ts : Math.floor(new Date(ts).getTime() / 1000);
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function rawToDisplayAmount(raw: string, decimalsRaw: string): string {
  if (!/^\d+$/.test(raw)) return '0';
  const decimals = Math.max(0, Number(decimalsRaw || '0'));
  if (!Number.isFinite(decimals)) return '0';
  if (decimals === 0) return BigInt(raw).toLocaleString();
  const normalized = raw.padStart(decimals + 1, '0');
  const intPart = normalized.slice(0, normalized.length - decimals) || '0';
  const fracPartRaw = normalized.slice(normalized.length - decimals);
  const fracPart = fracPartRaw.replace(/0+$/, '').slice(0, 6);
  const formattedInt = BigInt(intPart).toLocaleString();
  return fracPart ? `${formattedInt}.${fracPart}` : formattedInt;
}

export function rawToUsdValue(raw: string, decimalsRaw: string, rateRaw: string): number {
  if (!/^\d+$/.test(raw)) return 0;
  const decimals = Math.max(0, Number(decimalsRaw || '0'));
  const rate = Number(rateRaw || '0');
  if (!Number.isFinite(decimals) || !Number.isFinite(rate) || rate <= 0) return 0;
  const normalized = raw.padStart(decimals + 1, '0');
  const intPart = normalized.slice(0, normalized.length - decimals) || '0';
  const fracPart = normalized.slice(normalized.length - decimals, normalized.length - decimals + 8);
  const tokenAmount = Number(`${intPart}.${fracPart}`);
  if (!Number.isFinite(tokenAmount)) return 0;
  return tokenAmount * rate;
}

// ── Profile (user microservice) ───────────────────────────────

export function useUserProfile(walletAddress: string) {
  return useQuery<UserProfile | null>({
    queryKey: queryKeys.userProfile(walletAddress),
    queryFn: async () => {
      const res = await fetch(`${sdkBaseUrls.users}/users/${walletAddress}.json`);
      return res.ok ? res.json() : null;
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
}

// ── Created coins (from profile) ─────────────────────────────

export function useCreatedCoins(profile: UserProfile | null | undefined) {
  return useQuery<CreatedCoinDisplay[]>({
    queryKey: ['created-coins', profile?.wallet_address?.toLowerCase()],
    queryFn: async () => {
      const pools = profile?.created_pools ?? [];
      if (pools.length === 0) return [];
      const poolAddrs = pools.map((p) => p.poolAddress);

      let statsMap: Record<string, any> = {};
      try {
        const statsRes = await fetch(`${sdkBaseUrls.stats}/stats/batch?pools=${poolAddrs.join(',')}`);
        if (statsRes.ok) statsMap = await statsRes.json();
      } catch {}

      // ONE batch metadata request for all created tokens.
      const tokenAddrs = pools.map(
        (p) => statsMap[p.poolAddress]?.tokenAddress || p.tokenAddress,
      );
      const metaByToken = await fetchTokenMetadataBatch(tokenAddrs);

      return pools.map((p, i) => {
        const tokenAddr = tokenAddrs[i];
        const meta = metaByToken[tokenAddr.toLowerCase()] ?? null;
        return {
          poolAddress: p.poolAddress,
          tokenAddress: tokenAddr,
          name: meta?.name || formatAddress(tokenAddr, 4),
          symbol: meta?.symbol || '',
          logo: meta?.images?.logo || null,
          marketCap: statsMap[p.poolAddress]?.marketCap || '0',
        };
      });
    },
    enabled: !!profile?.created_pools?.length,
    staleTime: 30_000,
  });
}

// ── Wallet balances (Paxscan) ────────────────────────────────

export function useWalletBalances(walletAddress: string) {
  return useQuery<WalletBalanceItem[]>({
    queryKey: ['wallet-balances', walletAddress.toLowerCase()],
    queryFn: async () => {
      const res = await fetch(`https://api.paxscan.io/api/v2/addresses/${walletAddress}/tokens`);
      if (!res.ok) return [];
      const d: { items?: WalletBalanceItem[] } = await res.json();
      return d.items ?? [];
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
    refetchIntervalInBackground: false,
  });
}

// ── Address counters (paxscan) ────────────────────────────────

export function useAddressCounters(walletAddress: string, isValid: boolean) {
  return useQuery<AddressCounters | null>({
    queryKey: ['address-counters', walletAddress.toLowerCase()],
    queryFn: () => fetchAddressCounters(walletAddress).catch(() => null),
    enabled: isValid && !!walletAddress,
    staleTime: 60_000,
  });
}

// ── Activity (transactions / token transfers) ────────────────

export function useExplorerTransactions(walletAddress: string, enabled: boolean) {
  return useQuery<ExplorerTransaction[]>({
    queryKey: ['explorer-txs', walletAddress.toLowerCase()],
    queryFn: async () => {
      const d = await fetchAddressTransactions(walletAddress);
      return d.items;
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useExplorerTransfers(walletAddress: string, enabled: boolean) {
  return useQuery<ExplorerTokenTransfer[]>({
    queryKey: ['explorer-transfers', walletAddress.toLowerCase()],
    queryFn: async () => {
      const d = await fetchAddressTokenTransfers(walletAddress);
      return d.items;
    },
    enabled,
    staleTime: 30_000,
  });
}

// ── Public rewards (NFT-claimable fees by pool) ─────────────

interface UsePublicRewardsArgs {
  walletAddress: string;
  isValidWallet: boolean;
}

export function usePublicRewards({ walletAddress, isValidWallet }: UsePublicRewardsArgs) {
  const publicClient = usePublicClient();
  const viewedWallet = (isValidWallet ? walletAddress : ZERO) as `0x${string}`;

  const { data: nftAddress } = useReadFeesRouterNftContract();
  const nft = (nftAddress as `0x${string}`) || ZERO;

  const { data: pools } = useReadQuoterGetPoolsByCreator({ creator: viewedWallet });
  const poolAddrs = useMemo(
    () => (Array.isArray(pools) ? pools : []) as `0x${string}`[],
    [pools],
  );

  const { data: balanceResult } = useReadContracts({
    contracts: [{
      address: nft,
      abi: ERC721_ENUMERABLE_ABI,
      functionName: 'balanceOf',
      args: [viewedWallet],
    }],
    query: { enabled: isValidWallet && !!nft && nft !== ZERO },
  });

  const nftBalance = balanceResult?.[0]?.result as bigint | undefined;
  const balanceNum = nftBalance ? Number(nftBalance) : 0;

  const tokenIdContracts = Array.from({ length: balanceNum }, (_, i) => ({
    address: nft,
    abi: ERC721_ENUMERABLE_ABI,
    functionName: 'tokenOfOwnerByIndex' as const,
    args: [viewedWallet, BigInt(i)],
  }));

  const { data: tokenIdResults } = useReadContracts({
    contracts: tokenIdContracts,
    query: { enabled: balanceNum > 0 && isValidWallet && nft !== ZERO },
  });

  const nftIds = useMemo(
    () => (tokenIdResults ?? [])
      .map((r) => r.result as bigint | undefined)
      .filter((id): id is bigint => id !== undefined),
    [tokenIdResults],
  );

  const [items, setItems] = useState<PublicRewardItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isValidWallet || !publicClient) {
      setItems([]);
      setLoading(false);
      return;
    }
    const client = publicClient;
    let cancelled = false;
    setLoading(true);

    async function load() {
      const metaMap = new Map<number, RewardPoolMeta>();
      if (poolAddrs.length > 0) {
        try {
          const statsRes = await fetch(`${sdkBaseUrls.stats}/stats/batch?pools=${poolAddrs.join(',')}`);
          if (statsRes.ok) {
            const statsMap = await statsRes.json();

            // Resolve token addresses up front (some pools may not have
            // surfaced a token in stats yet; those just get the placeholder
            // name + null logo).
            const tokenAddrs = poolAddrs.map((p) => statsMap[p]?.tokenAddress || '');
            const validTokens = tokenAddrs.filter((a): a is string => !!a);
            const metaByToken = validTokens.length > 0
              ? await fetchTokenMetadataBatch(validTokens)
              : {};

            poolAddrs.forEach((poolAddr, idx) => {
              const stat = statsMap[poolAddr];
              const tokenAddr = tokenAddrs[idx];
              const meta = tokenAddr ? metaByToken[tokenAddr.toLowerCase()] : null;
              metaMap.set(idx, {
                name: meta?.name || formatAddress(poolAddr, 4),
                symbol: meta?.symbol || '',
                logo: meta?.images?.logo || null,
                poolAddress: poolAddr,
                tokenAddress: tokenAddr,
                marketCap: stat?.marketCap || '0',
                volume24h: stat?.volume24h || '0',
              });
            });
          }
        } catch {}
      }

      const claimableAmounts = await Promise.all(
        nftIds.map(async (nftId) => {
          try {
            const result = await client.readContract({
              address: FEES_ROUTER_ADDRESS,
              abi: FeesRouterAbi as any,
              functionName: 'claimFees',
              args: [nftId],
              account: viewedWallet,
            });
            return (result as bigint) ?? 0n;
          } catch { return 0n; }
        }),
      );

      if (cancelled) return;

      const built: PublicRewardItem[] = nftIds.map((nftId, i) => ({
        nftId,
        claimable: claimableAmounts[i],
        pool: metaMap.get(i) ?? null,
      }));

      if (poolAddrs.length > nftIds.length) {
        for (let i = nftIds.length; i < poolAddrs.length; i += 1) {
          built.push({ nftId: 0n, claimable: 0n, pool: metaMap.get(i) ?? null });
        }
      }

      setItems(built);
      setLoading(false);
    }

    load().catch(() => { if (!cancelled) { setItems([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [isValidWallet, publicClient, viewedWallet, poolAddrs, nftIds]);

  return { items, loading };
}

// ── Public unified hook: composes everything for ProfileView ─

export function useProfileData(walletAddress: string) {
  const { address: myAddress, isConnected } = useAccount();

  const isOwnProfile = isConnected && myAddress?.toLowerCase() === walletAddress.toLowerCase();
  const isValidWallet = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);

  const profileQuery = useUserProfile(walletAddress);
  const balancesQuery = useWalletBalances(walletAddress);
  const counters = useAddressCounters(walletAddress, isValidWallet);
  const createdCoinsQuery = useCreatedCoins(profileQuery.data);
  const publicRewards = usePublicRewards({ walletAddress, isValidWallet });

  const refreshProfile = useCallback(() => {
    profileQuery.refetch();
  }, [profileQuery]);

  return {
    profile: profileQuery.data ?? null,
    profileLoading: profileQuery.isLoading,
    refreshProfile,
    balances: balancesQuery.data ?? [],
    balancesLoading: balancesQuery.isLoading,
    addressCounters: counters.data ?? null,
    createdCoins: createdCoinsQuery.data ?? [],
    coinsLoading: createdCoinsQuery.isLoading,
    publicRewards: publicRewards.items,
    publicRewardsLoading: publicRewards.loading,
    isOwnProfile: !!isOwnProfile,
    isValidWallet,
    myAddress,
    isConnected,
  };
}
