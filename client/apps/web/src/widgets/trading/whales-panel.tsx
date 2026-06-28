'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatAddress, safeFixed } from '@/utils/format';
import { dataApiUrl } from '@/core/sdk-config';
import { useReloadOnPoolEvent } from '@/hooks/market/use-stream-refetch';

const WHALE_THRESHOLD_PCT = 1;

interface WhaleHolder {
  rank: number;
  holderAddress: string;
  balance: string;
  pctOfSupply: number;
  pctOfSupplyHuman: string;
  isCreator: boolean;
  lastUpdated: number;
}

interface WhalesResponse {
  poolAddress: string;
  whaleThresholdPct: number;
  whaleCount: number;
  whales: WhaleHolder[];
}

interface WhalesPanelProps {
  poolAddress: string;
}

interface BffHolder {
  holderAddress?: string;
  address?: string;
  balance?: string;
  pctOfSupply?: string | number;
  pctOfSupplyPct?: number;
}

export default function WhalesPanel({ poolAddress }: WhalesPanelProps) {
  const [data, setData] = useState<WhalesResponse | null>(null);

  // Push-first: derive whales (holders above the threshold) from the /bff/token
  // top-10 holders + creator from stats. core/api has no /stats/{pool}/whales route.
  const load = useCallback(async () => {
    if (!poolAddress) return;
    try {
      const bff = await fetch(dataApiUrl(`/bff/token/${poolAddress}`)).then(r => (r.ok ? r.json() : null));
      if (!bff) return;
      const creator = String(bff.stats?.creatorAddress ?? '').toLowerCase();
      const holders: BffHolder[] = Array.isArray(bff.holders) ? bff.holders : [];
      const whales: WhaleHolder[] = holders
        .map((h, i) => {
          // The BFF converts bps -> human percent once; render and filter on
          // that percent so the whale cutoff is a true 1% (Bug 5).
          const pct = Number(h.pctOfSupplyPct ?? 0);
          const addr = h.holderAddress ?? h.address ?? '';
          return {
            rank: i + 1,
            holderAddress: addr,
            balance: h.balance ?? '0',
            pctOfSupply: pct,
            pctOfSupplyHuman: `${safeFixed(pct, 2)}%`,
            isCreator: !!creator && addr.toLowerCase() === creator,
            lastUpdated: 0,
          };
        })
        .filter((w) => w.pctOfSupply >= WHALE_THRESHOLD_PCT);
      setData({
        poolAddress,
        whaleThresholdPct: WHALE_THRESHOLD_PCT,
        whaleCount: whales.length,
        whales,
      });
    } catch {
      /* tolerate transient errors; next push delta re-loads */
    }
  }, [poolAddress]);

  useEffect(() => { void load(); }, [load]);
  useReloadOnPoolEvent(poolAddress, load);

  if (!data || data.whaleCount === 0) return null;

  return (
    <div className="border border-dark-gray rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-gray">
        <span className="text-size-12 font-manrope-bold text-half-enabled">Whales</span>
        <span className="text-size-10 text-dark-disabled">
          {data.whaleCount} holder{data.whaleCount !== 1 ? 's' : ''} &gt;{data.whaleThresholdPct}%
        </span>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
        <table className="w-full text-size-10">
          <thead className="sticky top-0 bg-gradient-black-gray">
            <tr className="text-dark-disabled">
              <th className="text-left px-3 py-1.5 w-6">#</th>
              <th className="text-left px-3 py-1.5">Holder</th>
              <th className="text-right px-3 py-1.5">% Supply</th>
            </tr>
          </thead>
          <tbody>
            {data.whales.map((w) => (
              <tr
                key={w.holderAddress}
                className={`border-t border-dark-gray/30 hover:bg-dark-gray2/30 ${w.isCreator ? 'bg-green-middle/5' : ''}`}
              >
                <td className="px-3 py-1.5 text-dark-disabled">{w.rank}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/profile/${w.holderAddress}`}
                      className="text-half-enabled hover:text-pink-middle transition"
                    >
                      {formatAddress(w.holderAddress, 4)}
                    </a>
                    {w.isCreator && (
                      <span className="text-size-7 px-1 py-0.5 rounded bg-green-middle/20 text-green-middle font-manrope-bold flex-shrink-0">
                        Creator
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right px-3 py-1.5 font-manrope-bold text-white">
                  {w.pctOfSupplyHuman}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
