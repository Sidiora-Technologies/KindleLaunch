'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useReadContracts, useWriteContract, usePublicClient } from 'wagmi';
import { formatAddress, formatCurrency, from6dec } from '@/utils/format';
import { sdkBaseUrls } from '@/core/sdk-config';
import { fetchTokenMetadataBatch } from '@/core/clients/metadata';
import {
  FEES_ROUTER_ADDRESS,
  useReadFeesRouterNftContract,
  useReadQuoterGetPoolsByCreator,
  ERC721_ENUMERABLE_ABI,
} from '@/core/network/contracts';
import FeesRouterAbi from '@/core/network/abis/FeesRouter.json';

interface PoolMeta {
  name: string;
  symbol: string;
  logo: string | null;
  poolAddress: string;
  tokenAddress: string;
  marketCap: string;
  volume24h: string;
}

interface NftReward {
  nftId: bigint;
  claimable: bigint;
  pool: PoolMeta | null;
}

const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;

export default function RewardsView() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [rewards, setRewards] = useState<NftReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<bigint | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<bigint | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const { data: nftAddress } = useReadFeesRouterNftContract();
  const nft = (nftAddress as `0x${string}`) || ZERO;

  const { data: pools } = useReadQuoterGetPoolsByCreator({ creator: address! });
  const poolAddrs = (Array.isArray(pools) ? pools : []) as `0x${string}`[];

  // Step 1: Read NFT balance
  const { data: balanceResult } = useReadContracts({
    contracts: [{
      address: nft,
      abi: ERC721_ENUMERABLE_ABI,
      functionName: 'balanceOf',
      args: [address!],
    }],
    query: { enabled: !!nft && nft !== ZERO && !!address },
  });

  const nftBalance = balanceResult?.[0]?.result as bigint | undefined;
  const balanceNum = nftBalance ? Number(nftBalance) : 0;

  // Step 2: Read all NFT token IDs
  const tokenIdContracts = Array.from({ length: balanceNum }, (_, i) => ({
    address: nft,
    abi: ERC721_ENUMERABLE_ABI,
    functionName: 'tokenOfOwnerByIndex' as const,
    args: [address!, BigInt(i)],
  }));

  const { data: tokenIdResults } = useReadContracts({
    contracts: tokenIdContracts,
    query: { enabled: balanceNum > 0 && !!address },
  });

  const nftIds = (tokenIdResults ?? [])
    .map(r => r.result as bigint | undefined)
    .filter((id): id is bigint => id !== undefined);

  // Step 3+4: Simulate claimFees with account (for correct msg.sender) + fetch pool metadata
  const claimRefetchRef = useRef(0);

  function triggerRefetch() {
    claimRefetchRef.current += 1;
    setClaimRefetch(prev => prev + 1);
  }

  const [claimRefetch, setClaimRefetch] = useState(0);

  useEffect(() => {
    if (nftIds.length === 0 && poolAddrs.length === 0) {
      setLoading(false);
      return;
    }
    if (!address || !publicClient) return;

    let cancelled = false;

    async function loadAll() {
      const metaMap = new Map<number, PoolMeta>();

      // Fetch stats for all pools in one batch + token metadata in one batch
      if (poolAddrs.length > 0) {
        try {
          const statsRes = await fetch(`${sdkBaseUrls.stats}/stats/batch?pools=${poolAddrs.join(',')}`);
          if (statsRes.ok) {
            const statsMap = await statsRes.json();

            const tokenAddrs = poolAddrs.map((p) => statsMap[p]?.tokenAddress || '');
            const validTokens = tokenAddrs.filter((a): a is string => !!a);
            const metaByToken = validTokens.length > 0
              ? await fetchTokenMetadataBatch(validTokens)
              : {};

            poolAddrs.forEach((poolAddr, idx) => {
              const s = statsMap[poolAddr];
              const tokenAddr = tokenAddrs[idx];
              const m = tokenAddr ? metaByToken[tokenAddr.toLowerCase()] : null;
              metaMap.set(idx, {
                name: m?.name || formatAddress(poolAddr, 4),
                symbol: m?.symbol || '',
                logo: m?.images?.logo || null,
                poolAddress: poolAddr,
                tokenAddress: tokenAddr,
                marketCap: s?.marketCap || '0',
                volume24h: s?.volume24h || '0',
              });
            });
          }
        } catch {}
      }

      // Simulate claimFees for each NFT with user's address as msg.sender
      const claimableAmounts = await Promise.all(
        nftIds.map(async (nftId) => {
          try {
            const result = await publicClient!.readContract({
              address: FEES_ROUTER_ADDRESS,
              abi: FeesRouterAbi as any,
              functionName: 'claimFees',
              args: [nftId],
              account: address,
            });
            return (result as bigint) ?? 0n;
          } catch {
            return 0n;
          }
        })
      );

      if (cancelled) return;

      // Build rewards array: match NFT IDs to pools by index
      const built: NftReward[] = nftIds.map((nftId, i) => ({
        nftId,
        claimable: claimableAmounts[i],
        pool: metaMap.get(i) ?? null,
      }));

      // If more pools than NFTs, show pools without NFTs too
      if (poolAddrs.length > nftIds.length) {
        for (let i = nftIds.length; i < poolAddrs.length; i++) {
          built.push({
            nftId: 0n,
            claimable: 0n,
            pool: metaMap.get(i) ?? null,
          });
        }
      }

      setRewards(built);
      setLoading(false);
    }

    loadAll();
    return () => { cancelled = true; };
  }, [nftIds.length, poolAddrs.length, address, publicClient, claimRefetch]);

  // Claim handler
  const { writeContract, isPending } = useWriteContract();

  const handleClaim = useCallback((nftId: bigint) => {
    setClaimingId(nftId);
    setClaimError(null);
    setClaimSuccess(null);

    writeContract(
      {
        address: FEES_ROUTER_ADDRESS,
        abi: FeesRouterAbi as any,
        functionName: 'claimFees',
        args: [nftId],
      },
      {
        onSuccess: () => {
          setClaimSuccess(nftId);
          setClaimingId(null);
          triggerRefetch();
        },
        onError: (err) => {
          setClaimError(err.message?.slice(0, 120) || 'Claim failed');
          setClaimingId(null);
        },
      },
    );
  }, [writeContract]);

  const totalClaimable = rewards.reduce((sum, r) => sum + r.claimable, 0n);
  const totalClaimableFormatted = from6dec(totalClaimable.toString());

  if (loading) {
    return (
      <div className="p-6 text-white max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-dark-gray rounded w-48" />
          <div className="h-4 bg-dark-gray rounded w-64" />
          <div className="h-24 bg-dark-gray rounded" />
          <div className="h-24 bg-dark-gray rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 text-white max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-size-16 font-manrope-bold">Creator Rewards</h1>
        <p className="text-size-12 text-dark-disabled mt-1">
          Claim accumulated trading fees from tokens you created.
        </p>
      </div>

      {/* Total claimable banner */}
      <div className="rounded-xl border border-green-middle/30 bg-green-opacity-002 p-4">
        <div className="text-size-10 text-dark-disabled">Total claimable fees</div>
        <div className="text-[24px] font-manrope-extra-bold text-green-middle leading-tight mt-1">
          {formatCurrency(totalClaimableFormatted)}
        </div>
        <div className="text-size-10 text-dark-disabled mt-0.5">
          Across {rewards.filter(r => r.nftId > 0n).length} token{rewards.filter(r => r.nftId > 0n).length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Error/success banners */}
      {claimError && (
        <div className="rounded-lg border border-red-middle/30 bg-red-opacity-005 px-4 py-3 text-size-11 text-red-middle">
          {claimError}
          <button onClick={() => setClaimError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      {claimSuccess && (
        <div className="rounded-lg border border-green-middle/30 bg-green-opacity-005 px-4 py-3 text-size-11 text-green-middle">
          Fees claimed successfully.
          <button onClick={() => setClaimSuccess(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Token list */}
      {rewards.length === 0 ? (
        <div className="border border-dark-gray rounded-xl p-8 text-center text-dark-disabled text-size-13">
          You haven't created any tokens yet. Create a token to start earning fees.
        </div>
      ) : (
        <div className="space-y-3">
          {rewards.map((r, i) => {
            const claimableFormatted = from6dec(r.claimable.toString());
            const hasClaimable = r.claimable > 0n;
            const isClaiming = isPending && claimingId === r.nftId;
            const pool = r.pool;

            return (
              <div
                key={r.nftId > 0n ? r.nftId.toString() : `pool-${i}`}
                className="rounded-xl border border-dark-gray overflow-hidden"
              >
                {/* Pool header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-lg bg-dark-gray overflow-hidden flex-shrink-0 flex items-center justify-center">
                    <img
                      src={pool?.logo || '/shadcn.png'}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-size-13 font-manrope-bold text-white truncate">
                        {pool?.name || `Token #${i + 1}`}
                      </span>
                      {pool?.symbol && (
                        <span className="text-size-11 text-dark-disabled">{pool.symbol}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {pool?.poolAddress && (
                        <a
                          href={`/token/${pool.poolAddress}`}
                          className="text-size-10 text-pink-middle hover:underline"
                        >
                          View token
                        </a>
                      )}
                      {pool?.marketCap && pool.marketCap !== '0' && (
                        <span className="text-size-10 text-dark-disabled">
                          MC: {formatCurrency(from6dec(pool.marketCap))}
                        </span>
                      )}
                      {r.nftId > 0n && (
                        <span className="text-size-9 text-dark-disabled">
                          NFT #{r.nftId.toString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Claimable fees + claim button */}
                {r.nftId > 0n && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-dark-gray bg-dark-gray4/30">
                    <div>
                      <div className="text-size-9 text-dark-disabled">Claimable fees</div>
                      <div className={`text-size-14 font-manrope-bold leading-tight ${hasClaimable ? 'text-green-middle' : 'text-dark-disabled'}`}>
                        {formatCurrency(claimableFormatted)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleClaim(r.nftId)}
                      disabled={isClaiming || !hasClaimable}
                      className={`px-4 py-2.5 rounded-xl text-size-12 font-manrope-bold transition min-w-[100px] ${
                        hasClaimable
                          ? 'bg-green-middle text-black-gray hover:bg-green-middle2 active:opacity-80'
                          : 'bg-dark-gray text-dark-disabled cursor-not-allowed'
                      } disabled:opacity-40`}
                    >
                      {isClaiming ? 'Claiming...' : hasClaimable ? 'Claim' : 'No fees'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
