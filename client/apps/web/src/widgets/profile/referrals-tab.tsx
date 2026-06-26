'use client';

import { useCallback, useEffect, useState } from 'react';
import { safeFixed } from '@/utils/format';
import { getSharerStats, type SharerStats } from '@/core/clients/pnl';
import { sdkBaseUrls } from '@/core/sdk-config';

interface ReferralsTabProps {
  walletAddress: string;
}

export default function ReferralsTab({ walletAddress }: ReferralsTabProps) {
  const [stats, setStats] = useState<SharerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    getSharerStats(walletAddress)
      .then((d) => {
        if (!cancelled) setStats(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load sharer stats');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (loading) {
    return (
      <div className="py-8 text-center text-dark-disabled text-size-12 animate-pulse">
        Loading referrals…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-middle text-size-12">{error}</div>
    );
  }

  if (!stats || stats.shortCodes.length === 0) {
    return (
      <div className="py-8 text-center text-dark-disabled text-size-12">
        No shares yet — share a PNL card to start earning referral rewards.
      </div>
    );
  }

  const convRate =
    stats.totalClicks > 0
      ? safeFixed((stats.totalConversions / stats.totalClicks) * 100, 1)
      : '0.0';

  return (
    <div className="space-y-4">
      {/* Aggregate stats */}
      <div className="border border-dark-gray7 rounded-xl bg-dark-gray4 overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-gray7 flex items-center justify-between">
          <h3 className="text-size-13 font-manrope-bold text-white">Funnel</h3>
          <span className="text-size-10 text-dark-disabled uppercase tracking-wider">
            All time
          </span>
        </div>
        <div className="grid grid-cols-4 gap-px bg-dark-gray7">
          <FunnelStat label="Views" value={stats.totalViews} />
          <FunnelStat label="Clicks" value={stats.totalClicks} />
          <FunnelStat label="Wallet binds" value={stats.totalWalletBinds} />
          <FunnelStat label="Conversions" value={stats.totalConversions} />
        </div>
        <div className="px-4 py-2.5 text-size-11 text-dark-disabled flex items-center justify-between border-t border-dark-gray7">
          <span>
            Click → trade conversion{' '}
            <span className="text-half-enabled font-manrope-bold">{convRate}%</span>
          </span>
        </div>
      </div>

      {/* Rewards */}
      <div className="grid grid-cols-2 gap-3">
        <RewardCard
          label="Pending rewards"
          value={stats.pendingRewards}
          tone="neutral"
          subtitle="Awaiting distribution"
        />
        <RewardCard
          label="Credited rewards"
          value={stats.creditedRewards}
          tone="positive"
          subtitle="Paid out"
        />
      </div>

      {/* Short codes list */}
      <div className="border border-dark-gray7 rounded-xl bg-dark-gray4 overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-gray7">
          <h3 className="text-size-13 font-manrope-bold text-white">
            Your share codes
          </h3>
          <p className="text-size-10 text-dark-disabled mt-0.5">
            Each card you mint gets a unique code. Clicks and conversions are attributed to you.
          </p>
        </div>
        <div className="divide-y divide-dark-gray7">
          {stats.shortCodes.map((code) => (
            <ShortCodeRow key={code} code={code} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortCodeRow({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `https://sidiora.fun/r/${code}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }, [shareUrl]);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-size-12 font-mono text-half-enabled">{code}</div>
        <div className="text-size-10 text-dark-disabled truncate">{shareUrl}</div>
      </div>
      <button
        onClick={handleCopy}
        className={`px-3 py-1.5 rounded-lg text-size-11 font-manrope-bold transition border ${
          copied
            ? 'bg-green-middle/15 text-green-middle border-green-middle/40'
            : 'bg-dark-gray2 text-half-enabled border-dark-gray hover:border-half-enabled'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-dark-gray4 px-3 py-3 text-center">
      <div className="text-size-9 text-dark-disabled uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-size-16 font-manrope-extra-bold text-white tabular-nums">
        {compactNumber(value)}
      </div>
    </div>
  );
}

function RewardCard({
  label,
  value,
  tone,
  subtitle,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'neutral';
  subtitle: string;
}) {
  const color = tone === 'positive' ? 'text-green-middle' : 'text-half-enabled';
  return (
    <div className="border border-dark-gray7 rounded-xl bg-dark-gray4 px-4 py-3.5">
      <div className="text-size-10 text-dark-disabled uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-size-18 font-manrope-extra-bold tabular-nums ${color}`}>
        {compactNumber(value)}
      </div>
      <div className="text-size-10 text-dark-disabled mt-0.5">{subtitle}</div>
    </div>
  );
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${safeFixed(n / 1_000_000, 1)}M`;
  if (n >= 1_000) return `${safeFixed(n / 1_000, 1)}K`;
  return String(n);
}
