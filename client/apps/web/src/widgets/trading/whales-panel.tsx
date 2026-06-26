'use client';

import { useEffect, useState } from 'react';
import { formatAddress } from '@/utils/format';
import { sdkBaseUrls } from '@/core/sdk-config';

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

export default function WhalesPanel({ poolAddress }: WhalesPanelProps) {
  const [data, setData] = useState<WhalesResponse | null>(null);

  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}/whales`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {}
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [poolAddress]);

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
