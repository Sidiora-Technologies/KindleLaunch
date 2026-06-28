'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { formatAddress } from '@/utils/format';
import { userApiUrl, getUserAvatarUrl } from '@/core/sdk-config';
import { useWatchlist } from '@/hooks/ui/use-watchlist';
import { useTokenStats } from '@/hooks/market/use-token-stats';
import { useTokenMetadata } from '@/hooks/market/use-token-metadata';
import { queryKeys } from '@/core/query-keys';

interface HeaderBarProps {
  poolAddress: string;
}

interface Creator {
  display_name?: string;
  wallet_address?: string;
  avatarUrl?: string | null;
}

function relativeAge(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function HeaderBar({ poolAddress }: HeaderBarProps) {
  const [copied, setCopied] = useState(false);
  const { toggle, check } = useWatchlist();
  const starred = check(poolAddress);

  const { data: stats } = useTokenStats(poolAddress);
  const tokenAddr = stats?.tokenAddress || poolAddress;
  const { data: meta } = useTokenMetadata(tokenAddr);

  const { data: creator } = useQuery<Creator | null>({
    queryKey: queryKeys.userProfile(meta?.creator ?? ''),
    queryFn: async () => {
      if (!meta?.creator) return null;
      const res = await fetch(userApiUrl(`/users/${meta.creator}`));
      return res.ok ? res.json() : null;
    },
    enabled: !!meta?.creator,
    staleTime: 5 * 60_000,
  });

  const tokenAddress = meta?.token_address || stats?.tokenAddress || poolAddress;
  const age = relativeAge(stats?.createdAt);
  const logoUrl = meta?.images?.logo;

  const handleCopyCA = async () => {
    await navigator.clipboard.writeText(tokenAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/token/${poolAddress}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${meta?.name || 'Token'} on Sidiora`, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="px-4 pt-3 pb-2">
      <div className="flex items-start gap-3">
        {/* Logo — large, round, like Pump */}
        <div className="w-14 h-14 rounded-full bg-dark-gray overflow-hidden flex-shrink-0 flex items-center justify-center border-2 border-dark-gray">
          <img src={logoUrl || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
        </div>

        {/* Name + meta row */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-size-18 font-manrope-extra-bold text-white leading-tight truncate max-w-[200px] sm:max-w-none">
              {meta?.name || '...'}
            </span>
            <span className="text-size-13 text-dark-disabled font-manrope-bold">
              {meta?.symbol || '...'}
            </span>
            {meta?.tags && meta.tags.length > 0 && (
              <span className="text-size-9 px-1.5 py-0.5 rounded-full bg-green-opacity-015 text-green-middle border border-green-middle/30">
                {meta.tags[0]}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Creator badge */}
            {(creator || meta?.creator) && (
              <Link
                href={`/profile/${meta?.creator || ''}`}
                className="flex items-center gap-1.5 hover:opacity-80 transition"
              >
                <div className="w-4 h-4 rounded-full bg-green-middle/30 overflow-hidden flex items-center justify-center">
                  {creator?.avatarUrl && meta?.creator ? (
                    <img src={getUserAvatarUrl(meta.creator)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-size-7 text-green-middle">
                      {(creator?.display_name || meta?.creator || '').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-size-11 text-green-middle">
                  {creator?.display_name || formatAddress(meta?.creator || '', 4)}
                </span>
              </Link>
            )}
            {age && (
              <span className="text-size-10 text-dark-disabled">
                {age} ago
              </span>
            )}
          </div>

          {/* Action row: Share, CA pill, Star */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <button
              onClick={handleShare}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dark-gray text-size-10 text-half-enabled hover:border-half-enabled transition"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              Share
            </button>

            <button
              onClick={handleCopyCA}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dark-gray text-size-10 text-half-enabled hover:border-half-enabled transition font-mono"
            >
              {formatAddress(tokenAddress, 4)}...{tokenAddress.slice(-4)}
              {copied ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8BFFC5" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              )}
            </button>

            <button
              onClick={() => toggle(poolAddress)}
              className={`w-7 h-7 rounded-full border flex items-center justify-center transition text-size-14 ${
                starred ? 'border-yellow-middle text-yellow-middle' : 'border-dark-gray text-dark-disabled hover:text-half-enabled'
              }`}
              title={starred ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {starred ? '\u2605' : '\u2606'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
