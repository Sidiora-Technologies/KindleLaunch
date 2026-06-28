'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, usePublicClient, useReadContracts } from 'wagmi';
import { formatAddress, formatCurrency, from6dec, formatNumber, safeFixed } from '@/utils/format';
import { dataApiUrl, metadataApiUrl, userApiUrl, getUserAvatarUrl } from '@/core/sdk-config';
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
import ProfileEditModal from './profile-edit-modal';
import PositionsTab from './positions-tab';
import ReferralsTab from './referrals-tab';
import NetWorthChart from './net-worth-chart';
import PremiumErrorBoundary from '@/ui/shared/premium-error-boundary';
import { ProfileSkeleton } from '@/ui/shared/skeletons';

interface UserProfile {
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

interface CreatedCoinDisplay {
  poolAddress: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  logo: string | null;
  marketCap: string;
}

interface WalletBalanceItem {
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

interface RewardPoolMeta {
  name: string;
  symbol: string;
  logo: string | null;
  poolAddress: string;
  tokenAddress: string;
  marketCap: string;
  volume24h: string;
}

interface PublicRewardItem {
  nftId: bigint;
  claimable: bigint;
  pool: RewardPoolMeta | null;
}

type ProfileTab = 'balances' | 'positions' | 'coins' | 'rewards' | 'referrals' | 'activity';
type ActivitySubTab = 'transactions' | 'transfers';

interface ProfileViewProps {
  walletAddress: string;
}

function buildDmConversationId(a: string, b: string): string {
  const sorted = [a.toLowerCase(), b.toLowerCase()].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;

function relativeAge(ts: string | number): string {
  const sec = typeof ts === 'number' ? ts : Math.floor(new Date(ts).getTime() / 1000);
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function ExpandableBalanceCards({ balances }: { balances: WalletBalanceItem[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  return (
    <div className="grid gap-2">
      {balances.map((balance, idx) => {
        const isExpanded = expandedIdx === idx;
        const decimals = Math.max(0, Number(balance.token.decimals || '0'));
        const rate = Number(balance.token.exchange_rate || '0');
        const rawNormalized = balance.value.padStart(decimals + 1, '0');
        const intPart = rawNormalized.slice(0, rawNormalized.length - decimals) || '0';
        const fracPart = rawNormalized.slice(rawNormalized.length - decimals).replace(/0+$/, '').slice(0, 6);
        const displayAmt = fracPart ? `${BigInt(intPart).toLocaleString()}.${fracPart}` : BigInt(intPart).toLocaleString();
        const usdVal = Number.isFinite(rate) && rate > 0
          ? Number(`${intPart}.${rawNormalized.slice(rawNormalized.length - decimals, rawNormalized.length - decimals + 8)}`) * rate
          : 0;

        return (
          <motion.div
            key={balance.token.address_hash}
            layout
            onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            className="rounded-xl bg-black-gray2 p-3 cursor-pointer hover:bg-dark-gray7 transition-colors"
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          >
            <motion.div layout="position" className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg bg-dark-gray overflow-hidden flex items-center justify-center flex-shrink-0"
                  style={{ filter: 'url(#SkiperSquiCircleFilterLayout)' }}
                >
                  <img src={balance.token.icon_url || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <span className="text-size-13 font-manrope-bold text-white block">{balance.token.name}</span>
                  <span className="text-size-10 text-dark-disabled">{balance.token.symbol}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-size-13 text-half-enabled font-manrope-bold block">
                  {formatCurrency(usdVal)}
                </span>
                <span className="text-size-10 text-dark-disabled">{displayAmt} {balance.token.symbol}</span>
              </div>
            </motion.div>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 mt-3 border-t border-dark-gray6 space-y-1.5">
                    <div className="flex justify-between text-size-11">
                      <span className="text-dark-disabled">Address</span>
                      <span className="text-half-enabled font-mono text-size-10">
                        {balance.token.address_hash.slice(0, 6)}...{balance.token.address_hash.slice(-4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-size-11">
                      <span className="text-dark-disabled">Price</span>
                      <span className="text-half-enabled">
                        {Number.isFinite(rate) && rate > 0 ? `$${safeFixed(rate, 6)}` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-size-11">
                      <span className="text-dark-disabled">Decimals</span>
                      <span className="text-half-enabled">{balance.token.decimals}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function ProfileView({ walletAddress }: ProfileViewProps) {
  const router = useRouter();
  const { address: myAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProfileTab>('balances');
  const [createdCoins, setCreatedCoins] = useState<CreatedCoinDisplay[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(false);
  const [balances, setBalances] = useState<WalletBalanceItem[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [publicRewards, setPublicRewards] = useState<PublicRewardItem[]>([]);
  const [publicRewardsLoading, setPublicRewardsLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activitySubTab, setActivitySubTab] = useState<ActivitySubTab>('transactions');
  const [addressCounters, setAddressCounters] = useState<AddressCounters | null>(null);
  const [explorerTxs, setExplorerTxs] = useState<ExplorerTransaction[]>([]);
  const [explorerTxsLoading, setExplorerTxsLoading] = useState(false);
  const [explorerTransfers, setExplorerTransfers] = useState<ExplorerTokenTransfer[]>([]);
  const [explorerTransfersLoading, setExplorerTransfersLoading] = useState(false);

  const isOwnProfile = isConnected && myAddress?.toLowerCase() === walletAddress.toLowerCase();
  const isValidWallet = /^0x[a-fA-F0-9]{40}$/.test(walletAddress);
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

  const refreshProfile = useCallback(() => {
    fetch(userApiUrl(`/users/${walletAddress}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProfile(d))
      .catch(() => {});
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;

    fetch(userApiUrl(`/users/${walletAddress}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setProfile(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [walletAddress]);

  useEffect(() => {
    if (!isValidWallet || !publicClient) {
      setPublicRewards([]);
      setPublicRewardsLoading(false);
      return;
    }
    const client = publicClient;

    let cancelled = false;
    setPublicRewardsLoading(true);

    async function loadPublicRewards() {
      const metaMap = new Map<number, RewardPoolMeta>();

      if (poolAddrs.length > 0) {
        try {
          const statsRes = await fetch(dataApiUrl(`/stats/batch?pools=${poolAddrs.join(',')}`));
          if (statsRes.ok) {
            const statsMap = await statsRes.json();
            await Promise.all(
              poolAddrs.map(async (poolAddr, idx) => {
                const stat = statsMap[poolAddr];
                const tokenAddr = stat?.tokenAddress || '';
                let name = formatAddress(poolAddr, 4);
                let symbol = '';
                let logo: string | null = null;

                if (tokenAddr) {
                  try {
                    const metaRes = await fetch(metadataApiUrl(`/metadata/${tokenAddr}`));
                    if (metaRes.ok) {
                      const meta = await metaRes.json();
                      name = meta?.name || name;
                      symbol = meta?.symbol || '';
                      logo = meta?.images?.logo || null;
                    }
                  } catch {}
                }

                metaMap.set(idx, {
                  name,
                  symbol,
                  logo,
                  poolAddress: poolAddr,
                  tokenAddress: tokenAddr,
                  marketCap: stat?.marketCap || '0',
                  volume24h: stat?.volume24h || '0',
                });
              }),
            );
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
          } catch {
            return 0n;
          }
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
          built.push({
            nftId: 0n,
            claimable: 0n,
            pool: metaMap.get(i) ?? null,
          });
        }
      }

      setPublicRewards(built);
      setPublicRewardsLoading(false);
    }

    loadPublicRewards().catch(() => {
      if (!cancelled) {
        setPublicRewards([]);
        setPublicRewardsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [isValidWallet, publicClient, viewedWallet, poolAddrs, nftIds]);

  useEffect(() => {
    if (!profile?.created_pools || profile.created_pools.length === 0) {
      setCreatedCoins([]);
      return;
    }
    let cancelled = false;
    setCoinsLoading(true);

    const pools = profile.created_pools!;
    const poolAddrs = pools.map((p) => p.poolAddress);

    (async () => {
      try {
        let statsMap: Record<string, any> = {};
        const statsRes = await fetch(dataApiUrl(`/stats/batch?pools=${poolAddrs.join(',')}`));
        if (statsRes.ok) statsMap = await statsRes.json();

        const coins: CreatedCoinDisplay[] = await Promise.all(
          pools.map(async (p) => {
            const tokenAddr = statsMap[p.poolAddress]?.tokenAddress || p.tokenAddress;
            let meta: any = null;
            try {
              const metaRes = await fetch(metadataApiUrl(`/metadata/${tokenAddr}`));
              if (metaRes.ok) meta = await metaRes.json();
            } catch {}
            return {
              poolAddress: p.poolAddress,
              tokenAddress: tokenAddr,
              name: meta?.name || formatAddress(tokenAddr, 4),
              symbol: meta?.symbol || '',
              logo: meta?.images?.logo || null,
              marketCap: statsMap[p.poolAddress]?.marketCap || '0',
            };
          }),
        );
        if (!cancelled) setCreatedCoins(coins);
      } catch {}
      finally { if (!cancelled) setCoinsLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [profile]);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    setBalancesLoading(true);

    fetch(`https://api.paxscan.io/api/v2/addresses/${walletAddress}/tokens`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: WalletBalanceItem[] }) => {
        if (cancelled) return;
        setBalances(d.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setBalances([]);
      })
      .finally(() => {
        if (!cancelled) setBalancesLoading(false);
      });

    return () => { cancelled = true; };
  }, [walletAddress]);

  useEffect(() => {
    if (!isValidWallet) return;
    fetchAddressCounters(walletAddress).then(setAddressCounters).catch(() => {});
  }, [walletAddress, isValidWallet]);

  useEffect(() => {
    if (!isValidWallet || tab !== 'activity') return;
    let cancelled = false;

    if (activitySubTab === 'transactions' && explorerTxs.length === 0) {
      setExplorerTxsLoading(true);
      fetchAddressTransactions(walletAddress)
        .then((d) => { if (!cancelled) setExplorerTxs(d.items); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setExplorerTxsLoading(false); });
    }

    if (activitySubTab === 'transfers' && explorerTransfers.length === 0) {
      setExplorerTransfersLoading(true);
      fetchAddressTokenTransfers(walletAddress)
        .then((d) => { if (!cancelled) setExplorerTransfers(d.items); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setExplorerTransfersLoading(false); });
    }

    return () => { cancelled = true; };
  }, [walletAddress, isValidWallet, tab, activitySubTab]);

  const createdCount = profile?.created_pools?.length ?? 0;
  const totalBalancesUsd = balances.reduce(
    (sum, item) => sum + rawToUsdValue(item.value, item.token.decimals, item.token.exchange_rate),
    0,
  );
  const totalClaimableFees = publicRewards.reduce((sum, item) => sum + item.claimable, 0n);
  const totalRewardsPools = publicRewards.filter((item) => item.nftId > 0n).length;
  const rewardsWithFees = publicRewards.filter((item) => item.claimable > 0n).length;
  const totalRewardsMarketCap = publicRewards.reduce(
    (sum, item) => sum + from6dec(item.pool?.marketCap || '0'),
    0,
  );
  const totalRewardsVolume24h = publicRewards.reduce(
    (sum, item) => sum + from6dec(item.pool?.volume24h || '0'),
    0,
  );

  function rawToDisplayAmount(raw: string, decimalsRaw: string): string {
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

  function rawToUsdValue(raw: string, decimalsRaw: string, rateRaw: string): number {
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

  if (loading) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="p-6 text-white max-w-[1180px] mx-auto">
      <button onClick={() => router.back()} className="mb-4 text-dark-disabled hover:text-half-enabled transition">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Left — profile info + tabs */}
        <div className="flex-1 min-w-0">
          {/* Profile header */}
          <div className="flex items-center gap-5 mb-5">
            <div className="w-20 h-20 rounded-xl bg-dark-gray flex items-center justify-center overflow-hidden flex-shrink-0">
              {profile?.avatar_url ? (
                <img src={getUserAvatarUrl(walletAddress)} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-dark-gray6 font-manrope-extra-bold text-size-16">
                  {walletAddress.slice(2, 4).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-size-16 font-manrope-bold">
                {profile?.display_name || formatAddress(walletAddress, 6)}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-size-11 text-dark-disabled">{formatAddress(walletAddress, 4)}</span>
                {isOwnProfile && (
                  <button
                    onClick={() => setEditOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-green-middle/40 text-size-10 text-green-middle font-manrope-bold hover:bg-green-middle/10 transition"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit Profile
                  </button>
                )}
                <button
                  onClick={() => navigator.clipboard.writeText(walletAddress)}
                  className="text-dark-disabled hover:text-half-enabled transition"
                  title="Copy address"
                >
                  <img src="/icons/copy.svg" alt="" width={12} height={12} />
                </button>
                <a
                  href={`https://paxscan.paxeer.app/address/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-size-10 text-dark-disabled hover:text-half-enabled transition"
                >
                  View on explorer
                </a>
                {isConnected && myAddress && myAddress.toLowerCase() !== walletAddress.toLowerCase() && (
                  <Link
                    href={`/chat/${encodeURIComponent(buildDmConversationId(myAddress, walletAddress))}`}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-dark-gray2 text-size-10 text-half-enabled hover:bg-dark-gray7 transition ml-1"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5C21 16.19 16.97 20 12 20c-1.19 0-2.34-.21-3.39-.59L3 21l1.65-4.46A8.77 8.77 0 0 1 3 11.5C3 6.81 7.03 3 12 3s9 3.81 9 8.5z"/></svg>
                    Message
                  </Link>
                )}
              </div>
              {profile?.bio && (
                <p className="text-size-12 text-dark-disabled mt-2 max-w-md">{profile.bio}</p>
              )}
              {profile?.socials && (profile.socials.twitter || profile.socials.telegram || profile.socials.discord || profile.socials.website) && (
                <div className="flex items-center gap-3 mt-2">
                  {profile.socials.twitter && (
                    <a href={`https://twitter.com/${profile.socials.twitter.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-size-11 text-pink-middle hover:underline">Twitter</a>
                  )}
                  {profile.socials.telegram && (
                    <a href={profile.socials.telegram.startsWith('http') ? profile.socials.telegram : `https://t.me/${profile.socials.telegram}`} target="_blank" rel="noopener noreferrer" className="text-size-11 text-pink-middle hover:underline">Telegram</a>
                  )}
                  {profile.socials.discord && (
                    <span className="text-size-11 text-dark-disabled">{profile.socials.discord}</span>
                  )}
                  {profile.socials.website && (
                    <a href={profile.socials.website} target="_blank" rel="noopener noreferrer" className="text-size-11 text-pink-middle hover:underline">Website</a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl bg-black-gray2 p-3">
              <div className="text-size-10 text-dark-disabled uppercase tracking-wider">Followers</div>
              <div className="text-size-16 font-manrope-bold text-white mt-1">0</div>
            </div>
            <div className="rounded-xl bg-black-gray2 p-3">
              <div className="text-size-10 text-dark-disabled uppercase tracking-wider">Following</div>
              <div className="text-size-16 font-manrope-bold text-white mt-1">0</div>
            </div>
            <div className="rounded-xl bg-black-gray2 p-3">
              <div className="text-size-10 text-dark-disabled uppercase tracking-wider">Created coins</div>
              <div className="text-size-16 font-manrope-bold text-white mt-1">{createdCount}</div>
            </div>
            <div className="rounded-xl bg-black-gray2 p-3">
              <div className="text-size-10 text-dark-disabled uppercase tracking-wider">Balance value</div>
              <div className="text-size-16 font-manrope-bold text-white mt-1">{formatCurrency(totalBalancesUsd)}</div>
            </div>
          </div>

          {/* Net Worth Chart */}
          <PremiumErrorBoundary area="NetWorthChart" compact>
            <div className="mb-6">
              <NetWorthChart
                dataPoints={balances.map((b, i) => ({
                  timestamp: Date.now() - (balances.length - i) * 86400_000,
                  value: rawToUsdValue(b.value, b.token.decimals, b.token.exchange_rate),
                }))}
                currentValue={totalBalancesUsd}
              />
            </div>
          </PremiumErrorBoundary>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-dark-gray6 mb-5 overflow-x-auto no-scrollbar">
            {(
              ['balances', 'positions', 'coins', 'rewards', ...(isOwnProfile ? (['referrals'] as const) : ([] as const)), 'activity'] as const
            ).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-size-13 font-manrope-bold transition border-b-2 -mb-px whitespace-nowrap ${
                  tab === t
                    ? 'text-white border-green-middle'
                    : 'text-dark-disabled border-transparent hover:text-half-enabled'
                }`}
              >
                {t === 'balances'
                  ? 'Balances'
                  : t === 'positions'
                    ? 'Positions'
                    : t === 'coins'
                      ? 'Coins'
                      : t === 'rewards'
                        ? 'Creator Rewards'
                        : t === 'referrals'
                          ? 'Referrals'
                          : 'Activity'}
              </button>
            ))}
          </div>

          {/* Positions */}
          {tab === 'positions' && (
            <PositionsTab walletAddress={walletAddress} canShare={isOwnProfile} />
          )}

          {/* Referrals — own profile only */}
          {tab === 'referrals' && isOwnProfile && (
            <ReferralsTab walletAddress={walletAddress} />
          )}

          {/* Tab content */}
          {tab === 'balances' && (
            <div>
              {balancesLoading && (
                <div className="py-8 text-center text-dark-disabled text-size-12 animate-pulse">Loading balances...</div>
              )}
              {!balancesLoading && balances.length === 0 && (
                <div className="py-8 text-center text-dark-disabled text-size-13">No balances found.</div>
              )}
              {!balancesLoading && balances.length > 0 && (
                <ExpandableBalanceCards balances={balances} />
              )}
            </div>
          )}

          {tab === 'coins' && (
            <div>
              {coinsLoading && (
                <div className="py-8 text-center text-dark-disabled text-size-12 animate-pulse">Loading coins...</div>
              )}
              {!coinsLoading && createdCoins.length === 0 && (
                <div className="py-8 text-center text-dark-disabled text-size-13">No coins created yet.</div>
              )}
              {!coinsLoading && createdCoins.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-size-11 text-dark-disabled px-2 py-2 border-b border-dark-gray6">
                    <span>Coin</span>
                    <span>Market cap</span>
                  </div>
                  {createdCoins.map((coin) => (
                    <Link
                      key={coin.poolAddress}
                      href={`/token/${coin.poolAddress}`}
                      className="flex items-center justify-between px-2 py-3 border-b border-dark-gray6/60 hover:bg-dark-gray2 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-dark-gray overflow-hidden flex items-center justify-center flex-shrink-0">
                          <img src={coin.logo || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <span className="text-size-13 font-manrope-bold text-white block">{coin.name}</span>
                          <span className="text-size-10 text-dark-disabled">{coin.symbol}</span>
                        </div>
                      </div>
                      <span className="text-size-13 text-half-enabled font-manrope-bold">
                        {formatCurrency(from6dec(coin.marketCap))}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'rewards' && (
            <div>
              {publicRewardsLoading && (
                <div className="py-8 text-center text-dark-disabled text-size-12 animate-pulse">Loading creator rewards...</div>
              )}
              {!publicRewardsLoading && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-xl bg-black-gray2 p-3">
                    <div className="text-size-10 text-dark-disabled">Total claimable fees</div>
                    <div className="text-size-14 font-manrope-bold text-green-middle mt-1">
                      {formatCurrency(from6dec(totalClaimableFees.toString()))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-black-gray2 p-3">
                    <div className="text-size-10 text-dark-disabled">Reward NFTs</div>
                    <div className="text-size-14 font-manrope-bold text-white mt-1">{totalRewardsPools}</div>
                  </div>
                  <div className="rounded-xl bg-black-gray2 p-3">
                    <div className="text-size-10 text-dark-disabled">Pools with fees</div>
                    <div className="text-size-14 font-manrope-bold text-white mt-1">{rewardsWithFees}</div>
                  </div>
                  <div className="rounded-xl bg-black-gray2 p-3">
                    <div className="text-size-10 text-dark-disabled">24h volume (created)</div>
                    <div className="text-size-14 font-manrope-bold text-white mt-1">
                      {formatCurrency(totalRewardsVolume24h)}
                    </div>
                  </div>
                </div>
              )}

              {!publicRewardsLoading && publicRewards.length === 0 && (
                <div className="py-8 text-center text-dark-disabled text-size-13">No creator rewards data yet.</div>
              )}

              {!publicRewardsLoading && publicRewards.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-size-11 text-dark-disabled px-2 py-2 border-b border-dark-gray6">
                    <span>Token</span>
                    <span>Claimable fees</span>
                  </div>
                  {publicRewards.map((item, idx) => (
                    <div
                      key={item.nftId > 0n ? item.nftId.toString() : `public-reward-${idx}`}
                      className="flex items-center justify-between px-2 py-3 border-b border-dark-gray6/60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-dark-gray overflow-hidden flex items-center justify-center flex-shrink-0">
                          <img src={item.pool?.logo || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-size-13 font-manrope-bold text-white block truncate">
                            {item.pool?.name || `Pool ${idx + 1}`}
                          </span>
                          <div className="text-size-10 text-dark-disabled flex items-center gap-2 flex-wrap">
                            <span>{item.pool?.symbol || '-'}</span>
                            {item.pool?.poolAddress && (
                              <Link className="text-pink-middle hover:underline" href={`/token/${item.pool.poolAddress}`}>
                                View token
                              </Link>
                            )}
                            {item.nftId > 0n && <span>NFT #{item.nftId.toString()}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-size-13 font-manrope-bold ${item.claimable > 0n ? 'text-green-middle' : 'text-dark-disabled'}`}>
                          {formatCurrency(from6dec(item.claimable.toString()))}
                        </span>
                        <div className="text-size-10 text-dark-disabled">
                          MC {formatCurrency(from6dec(item.pool?.marketCap || '0'))}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-2 py-3">
                    <span className="text-size-11 text-dark-disabled">Total market cap (created pools)</span>
                    <span className="text-size-13 font-manrope-bold text-half-enabled">
                      {formatCurrency(totalRewardsMarketCap)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'activity' && (
            <div>
              {addressCounters && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-xl bg-black-gray2 p-3">
                    <div className="text-size-10 text-dark-disabled">Transactions</div>
                    <div className="text-size-14 font-manrope-bold text-white mt-1">
                      {addressCounters.transactionsCount.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl bg-black-gray2 p-3">
                    <div className="text-size-10 text-dark-disabled">Token transfers</div>
                    <div className="text-size-14 font-manrope-bold text-white mt-1">
                      {addressCounters.tokenTransfersCount.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl bg-black-gray2 p-3">
                    <div className="text-size-10 text-dark-disabled">Gas used</div>
                    <div className="text-size-14 font-manrope-bold text-white mt-1">
                      {addressCounters.gasUsageCount.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-1 border-b border-dark-gray6 mb-4">
                {(['transactions', 'transfers'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setActivitySubTab(st)}
                    className={`px-3 py-2 text-size-12 font-manrope-bold transition border-b-2 -mb-px ${
                      activitySubTab === st
                        ? 'text-white border-green-middle'
                        : 'text-dark-disabled border-transparent hover:text-half-enabled'
                    }`}
                  >
                    {st === 'transactions' ? 'Transactions' : 'Token Transfers'}
                  </button>
                ))}
              </div>

              {activitySubTab === 'transactions' && (
                <div>
                  {explorerTxsLoading && (
                    <div className="py-8 text-center text-dark-disabled text-size-12 animate-pulse">Loading transactions...</div>
                  )}
                  {!explorerTxsLoading && explorerTxs.length === 0 && (
                    <div className="py-8 text-center text-dark-disabled text-size-13">No transactions found.</div>
                  )}
                  {!explorerTxsLoading && explorerTxs.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-size-11">
                        <thead className="text-dark-disabled border-b border-dark-gray6">
                          <tr>
                            <th className="text-left px-2 py-2">Tx Hash</th>
                            <th className="text-left px-2 py-2">Method</th>
                            <th className="text-left px-2 py-2">From</th>
                            <th className="text-left px-2 py-2">To</th>
                            <th className="text-right px-2 py-2">Value</th>
                            <th className="text-right px-2 py-2">Age</th>
                          </tr>
                        </thead>
                        <tbody>
                          {explorerTxs.slice(0, 50).map((tx) => {
                            const isFrom = tx.from?.hash?.toLowerCase() === walletAddress.toLowerCase();
                            const age = tx.timestamp ? relativeAge(tx.timestamp) : '-';
                            const valWei = BigInt(tx.value || '0');
                            const valEth = Number(valWei) / 1e18;
                            return (
                              <tr key={tx.hash} className="border-b border-dark-gray6/50 hover:bg-dark-gray2 transition">
                                <td className="px-2 py-2">
                                  <a
                                    href={`https://paxscan.paxeer.app/tx/${tx.hash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-pink-middle hover:underline"
                                  >
                                    {formatAddress(tx.hash, 4)}
                                  </a>
                                </td>
                                <td className="px-2 py-2">
                                  <span className="px-1.5 py-0.5 rounded bg-dark-gray text-size-9 text-half-enabled">
                                    {tx.method || 'Transfer'}
                                  </span>
                                </td>
                                <td className="px-2 py-2">
                                  <span className={isFrom ? 'text-red-middle' : 'text-half-enabled'}>
                                    {formatAddress(tx.from?.hash || '', 4)}
                                  </span>
                                </td>
                                <td className="px-2 py-2">
                                  <span className={!isFrom ? 'text-green-middle' : 'text-half-enabled'}>
                                    {tx.to ? formatAddress(tx.to.hash, 4) : '-'}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-right text-white">
                                  {valEth > 0 ? safeFixed(valEth, 4) : '0'}
                                </td>
                                <td className="px-2 py-2 text-right text-dark-disabled">{age}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activitySubTab === 'transfers' && (
                <div>
                  {explorerTransfersLoading && (
                    <div className="py-8 text-center text-dark-disabled text-size-12 animate-pulse">Loading token transfers...</div>
                  )}
                  {!explorerTransfersLoading && explorerTransfers.length === 0 && (
                    <div className="py-8 text-center text-dark-disabled text-size-13">No token transfers found.</div>
                  )}
                  {!explorerTransfersLoading && explorerTransfers.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-size-11">
                        <thead className="text-dark-disabled border-b border-dark-gray6">
                          <tr>
                            <th className="text-left px-2 py-2">Tx Hash</th>
                            <th className="text-left px-2 py-2">Token</th>
                            <th className="text-left px-2 py-2">From</th>
                            <th className="text-left px-2 py-2">To</th>
                            <th className="text-right px-2 py-2">Amount</th>
                            <th className="text-right px-2 py-2">Age</th>
                          </tr>
                        </thead>
                        <tbody>
                          {explorerTransfers.slice(0, 50).map((tf, idx) => {
                            const isFrom = tf.from?.hash?.toLowerCase() === walletAddress.toLowerCase();
                            const age = tf.timestamp ? relativeAge(tf.timestamp) : '-';
                            const decimals = parseInt(tf.total?.decimals || tf.token?.decimals || '18', 10);
                            const rawVal = BigInt(tf.total?.value || '0');
                            const display = Number(rawVal) / Math.pow(10, decimals);
                            return (
                              <tr key={`${tf.tx_hash}-${idx}`} className="border-b border-dark-gray6/50 hover:bg-dark-gray2 transition">
                                <td className="px-2 py-2">
                                  <a
                                    href={`https://paxscan.paxeer.app/tx/${tf.tx_hash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-pink-middle hover:underline"
                                  >
                                    {formatAddress(tf.tx_hash, 4)}
                                  </a>
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex items-center gap-1.5">
                                    {tf.token?.icon_url && (
                                      <img src={tf.token.icon_url} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />
                                    )}
                                    <span className="text-white font-manrope-bold truncate max-w-[80px]">
                                      {tf.token?.symbol || tf.token?.name || '?'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-2 py-2">
                                  <span className={isFrom ? 'text-red-middle' : 'text-half-enabled'}>
                                    {formatAddress(tf.from?.hash || '', 4)}
                                  </span>
                                </td>
                                <td className="px-2 py-2">
                                  <span className={!isFrom ? 'text-green-middle' : 'text-half-enabled'}>
                                    {formatAddress(tf.to?.hash || '', 4)}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-right text-white">
                                  {display > 1000 ? formatNumber(display, 2) : safeFixed(display, 4)}
                                </td>
                                <td className="px-2 py-2 text-right text-dark-disabled">{age}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar — Created coins summary */}
        <div className="w-full lg:w-72 flex-shrink-0 lg:pt-1">
          <div className="rounded-xl bg-black-gray2 p-3">
            <h3 className="text-size-13 font-manrope-bold text-dark-disabled mb-2">
              Created coins ({createdCount})
            </h3>
            {createdCoins.length === 0 && !coinsLoading && (
              <p className="text-size-11 text-dark-disabled">None yet</p>
            )}
            {createdCoins.map((coin) => (
              <Link
                key={coin.poolAddress}
                href={`/token/${coin.poolAddress}`}
                className="flex items-center justify-between py-2 hover:bg-dark-gray7 transition rounded-lg px-1"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-dark-gray overflow-hidden flex items-center justify-center flex-shrink-0">
                    <img src={coin.logo || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <span className="text-size-12 font-manrope-bold text-white">{coin.name}</span>
                    <span className="text-size-10 text-dark-disabled block">{coin.symbol}</span>
                  </div>
                </div>
                <span className="text-size-12 text-half-enabled font-manrope-bold">
                  {formatCurrency(from6dec(coin.marketCap))}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isOwnProfile && (
        <ProfileEditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={refreshProfile}
          initial={{
            displayName: profile?.display_name || '',
            bio: profile?.bio || '',
            twitter: profile?.socials?.twitter || '',
            telegram: profile?.socials?.telegram || '',
            discord: profile?.socials?.discord || '',
            website: profile?.socials?.website || '',
            avatarUrl: profile?.avatar_url ? getUserAvatarUrl(walletAddress) : null,
          }}
        />
      )}
    </div>
  );
}
