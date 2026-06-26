'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatAddress, safeFixed } from '@/utils/format';
import { sdkBaseUrls, getUserAvatarUrl } from '@/core/sdk-config';
import { fetchAddressCounters, type AddressCounters } from '@/core/clients/explorer-api';

/**
 * 3.1: Uses backend /stats/:pool instead of Paxscan for creator holdings.
 */

interface CreatorCardProps {
  poolAddress: string;
}

interface CreatorData {
  display_name?: string;
  avatarUrl?: string | null;
}

export default function CreatorCard({ poolAddress }: CreatorCardProps) {
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [creatorAddr, setCreatorAddr] = useState<string | null>(null);
  const [holdingsPct, setHoldingsPct] = useState<number>(0);
  const [counters, setCounters] = useState<AddressCounters | null>(null);

  useEffect(() => {
    if (!poolAddress) return;
    (async () => {
      try {
        const statsRes = await fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}`).then(r => r.ok ? r.json() : null);
        if (!statsRes?.tokenAddress) return;

        // Get creator holdings pct from backend stats
        if (statsRes.creatorHoldingsPct != null) {
          setHoldingsPct(statsRes.creatorHoldingsPct);
        }

        const metaRes = await fetch(`${sdkBaseUrls.metadata}/metadata/${statsRes.tokenAddress}.json`).then(r => r.ok ? r.json() : null);
        if (!metaRes?.creator) return;
        setCreatorAddr(metaRes.creator);

        const userRes = await fetch(`${sdkBaseUrls.users}/users/${metaRes.creator}`).then(r => r.ok ? r.json() : null);
        if (userRes) setCreator(userRes);
      } catch { /* noop */ }
    })();
  }, [poolAddress]);

  useEffect(() => {
    if (!creatorAddr) return;
    fetchAddressCounters(creatorAddr).then(setCounters).catch(() => {});
  }, [creatorAddr]);

  if (!creatorAddr) return null;

  return (
    <div className="border border-dark-gray rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <Link
          href={`/profile/${creatorAddr}`}
          className="flex items-center gap-2.5 hover:opacity-80 transition"
        >
          <div className="w-9 h-9 rounded-full bg-green-middle/20 overflow-hidden flex items-center justify-center flex-shrink-0">
            {creator?.avatarUrl && creatorAddr ? (
              <img src={getUserAvatarUrl(creatorAddr)} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-size-12 font-manrope-bold text-green-middle">
                {(creator?.display_name || creatorAddr).slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <div className="text-size-12 font-manrope-bold text-white">
              {creator?.display_name || formatAddress(creatorAddr, 4)}
            </div>
            <span className="text-size-9 px-1.5 py-0.5 rounded bg-green-middle/20 text-green-middle font-manrope-bold">
              Creator
            </span>
          </div>
        </Link>

        <Link
          href={`/profile/${creatorAddr}`}
          className="text-size-10 px-3 py-1.5 rounded-full border border-dark-gray text-half-enabled hover:border-half-enabled hover:text-white transition font-manrope-bold"
        >
          Profile
        </Link>
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-dark-gray/50 flex-wrap">
        {holdingsPct > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-size-9 text-dark-disabled">Holdings</span>
            <span className="text-size-10 font-manrope-bold text-white">{safeFixed(holdingsPct, 1)}%</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-size-9 text-dark-disabled">Reward</span>
          <span className="text-size-10 font-manrope-bold text-green-middle">1.0%</span>
        </div>
        {counters && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-size-9 text-dark-disabled">Txs</span>
              <span className="text-size-10 font-manrope-bold text-half-enabled">{counters.transactionsCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-size-9 text-dark-disabled">Transfers</span>
              <span className="text-size-10 font-manrope-bold text-half-enabled">{counters.tokenTransfersCount.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
