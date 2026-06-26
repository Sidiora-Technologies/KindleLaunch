'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatAddress, formatNumber, safeFixed } from '@/utils/format';
import { sdkBaseUrls } from '@/core/sdk-config';

/**
 * 3.1: Uses backend /stats/:pool/holders instead of Paxscan API.
 */

interface BackendHolder {
  address: string;
  isContract: boolean;
  balance: string;
  balanceFormatted: number;
  pctOfSupply: number;
}

interface HoldersPanelProps {
  poolAddress: string;
}

type Tab = 'top' | 'all';

export default function HoldersPanel({ poolAddress }: HoldersPanelProps) {
  const [tab, setTab] = useState<Tab>('top');
  const [holders, setHolders] = useState<BackendHolder[]>([]);
  const [holderCount, setHolderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [top10Conc, setTop10Conc] = useState(0);
  const [creatorPct, setCreatorPct] = useState(0);

  const fetchData = useCallback(async () => {
    if (!poolAddress) return;
    setLoading(true);
    try {
      const [statsRes, holdersRes] = await Promise.all([
        fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}`).then(r => r.ok ? r.json() : null),
        fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}/holders?limit=50`).then(r => r.ok ? r.json() : null),
      ]);

      if (statsRes) {
        setHolderCount(statsRes.holderCount ?? 0);
        setTop10Conc(statsRes.top10Concentration ?? 0);
        setCreatorPct(statsRes.creatorHoldingsPct ?? 0);
      }

      if (holdersRes?.holders) {
        setHolders(holdersRes.holders);
      }
    } catch (e) {
      console.error('Failed to fetch holders:', e);
    } finally {
      setLoading(false);
    }
  }, [poolAddress]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const displayHolders = tab === 'top' ? holders.slice(0, 10) : holders;

  return (
    <div className="border border-dark-gray rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-gray">
        <div className="flex gap-1">
          {(['top', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded text-size-11 font-manrope-bold transition ${
                tab === t ? 'bg-pink-opacity-1 text-pink-middle' : 'text-dark-disabled hover:text-half-enabled'
              }`}
            >
              {t === 'top' ? 'Top Holders' : 'All Holders'}
            </button>
          ))}
        </div>
        <span className="text-size-10 text-dark-disabled">{holderCount} total</span>
      </div>

      <div className="flex gap-2 px-3 py-2">
        <div className="flex-1 border border-dark-gray rounded-lg p-2 text-center">
          <span className="text-size-9 text-dark-disabled block">Top 10 Concentration</span>
          <span className="text-size-13 font-manrope-bold text-white">{safeFixed(top10Conc, 2)}%</span>
        </div>
        <div className="flex-1 border border-dark-gray rounded-lg p-2 text-center">
          <span className="text-size-9 text-dark-disabled block">Creator Holdings</span>
          <span className="text-size-13 font-manrope-bold text-white">{safeFixed(creatorPct, 2)}%</span>
        </div>
      </div>

      <div className="max-h-[350px] overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-dark-disabled text-size-11 animate-pulse">Loading...</div>
        ) : displayHolders.length === 0 ? (
          <div className="p-4 text-center text-dark-disabled text-size-11">No holders yet</div>
        ) : (
          <table className="w-full text-size-10">
            <thead className="sticky top-0 bg-gradient-black-gray">
              <tr className="text-dark-disabled">
                <th className="text-left px-3 py-1.5">#</th>
                <th className="text-left px-3 py-1.5">Address</th>
                <th className="text-right px-3 py-1.5">Balance</th>
                <th className="text-right px-3 py-1.5">% Supply</th>
              </tr>
            </thead>
            <tbody>
              {displayHolders.map((h, i) => (
                <tr key={h.address} className="border-t border-dark-gray/50 hover:bg-dark-gray2/30">
                  <td className="px-3 py-1.5 text-dark-disabled">{i + 1}</td>
                  <td className="px-3 py-1.5 text-half-enabled">
                    <a
                      href={`https://paxscan.paxeer.app/address/${h.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-pink-middle transition"
                    >
                      {formatAddress(h.address, 6)}
                    </a>
                    {h.isContract && (
                      <span className="ml-1 text-size-8 text-dark-disabled">(contract)</span>
                    )}
                  </td>
                  <td className="text-right px-3 py-1.5 text-white">
                    {formatNumber(h.balanceFormatted, 2)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-white font-manrope-bold">
                    {safeFixed(h.pctOfSupply, 2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
