'use client';

import { useState, useEffect } from 'react';
import { formatAddress, safeFixed } from '@/utils/format';
import { sdkBaseUrls } from '@/core/sdk-config';
import { VirtualList } from '@/ui/common/bounded-list';

interface TopHoldersFullListProps {
  poolAddress: string;
}

interface Bracket {
  label: string;
  count: number;
  totalBalancePctBps: number;
}

interface WalletEntry {
  address: string;
  pctBps: number;
  rank: number;
}

interface HolderDistribution {
  totalHolders: number;
  brackets: Bracket[];
  top10: WalletEntry[];
  top10Pct: string;
  top20Pct: string;
  top50Pct: string;
  walletMap: WalletEntry[];
}

function bpsToPct(bps: number | string): number {
  return Number(bps) / 100;
}

export default function TopHoldersFullList({ poolAddress }: TopHoldersFullListProps) {
  const [dist, setDist] = useState<HolderDistribution | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}/holders/distribution`);
        if (res.ok && !cancelled) setDist(await res.json());
      } catch {}
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [poolAddress]);

  if (!dist) return null;

  const holders = showAll ? dist.walletMap : dist.top10;
  const maxBracketBps = Math.max(...dist.brackets.map(b => b.totalBalancePctBps), 1);

  return (
    <div className="border border-dark-gray rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-gray">
        <span className="text-size-11 font-manrope-bold text-half-enabled">
          Holder Distribution
          <span className="text-dark-disabled font-manrope-medium ml-1.5">{dist.totalHolders} holders</span>
        </span>
      </div>

      {/* Concentration metrics */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-dark-gray">
        {[
          { label: 'Top 10', val: bpsToPct(Number(dist.top10Pct)) },
          { label: 'Top 20', val: bpsToPct(Number(dist.top20Pct)) },
          { label: 'Top 50', val: bpsToPct(Number(dist.top50Pct)) },
        ].map(m => (
          <div key={m.label} className="flex flex-col items-center">
            <span className="text-size-8 text-dark-disabled leading-none">{m.label}</span>
            <span className="text-size-11 font-manrope-bold text-white leading-none mt-0.5">{safeFixed(m.val, 1)}%</span>
          </div>
        ))}
      </div>

      {/* Distribution brackets */}
      {dist.brackets.length > 0 && (
        <div className="px-3 py-2 border-b border-dark-gray space-y-1.5">
          {dist.brackets.map(b => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="text-size-9 text-dark-disabled w-10 text-right shrink-0">{b.label}</span>
              <div className="flex-1 h-[6px] bg-dark-gray rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-middle/60 rounded-full"
                  style={{ width: `${Math.max((b.totalBalancePctBps / maxBracketBps) * 100, 1)}%` }}
                />
              </div>
              <span className="text-size-9 text-half-enabled w-10 shrink-0">{safeFixed(bpsToPct(b.totalBalancePctBps), 1)}%</span>
              <span className="text-size-8 text-dark-disabled w-5 text-right shrink-0">{b.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Holder rows — virtualized so "show all" can list thousands of wallets
          without rendering thousands of DOM nodes (T02.3). */}
      <VirtualList
        items={holders}
        estimateSize={26}
        maxHeight={400}
        emptyMessage="No holders"
        renderItem={(h) => (
          <div className="flex items-center justify-between px-3 py-1 text-size-10 hover:bg-dark-gray2/20 transition">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-dark-disabled w-4 text-right flex-shrink-0">{h.rank}</span>
              <a
                href={`https://paxscan.paxeer.app/address/${h.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-half-enabled hover:text-pink-middle transition truncate"
              >
                {formatAddress(h.address, 4)}
              </a>
            </div>
            <span className="text-white font-manrope-bold flex-shrink-0 ml-2">
              {safeFixed(bpsToPct(h.pctBps), 2)}%
            </span>
          </div>
        )}
      />

      {/* Show all toggle */}
      {dist.walletMap.length > 10 && (
        <button
          onClick={() => setShowAll(prev => !prev)}
          className="w-full py-2 text-size-10 text-dark-disabled hover:text-half-enabled transition border-t border-dark-gray"
        >
          {showAll ? 'Show top 10' : `Show all ${dist.walletMap.length} holders`}
        </button>
      )}
    </div>
  );
}
