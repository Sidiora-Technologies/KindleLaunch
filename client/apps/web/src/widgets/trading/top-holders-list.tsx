'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatAddress, formatNumber, safeFixed, from6dec } from '@/utils/format';
import { dataApiUrl } from '@/core/sdk-config';
import { useReloadOnPoolEvent } from '@/hooks/market/use-stream-refetch';
import { fetchAddressCounters, type AddressCounters } from '@/core/clients/explorer-api';

/**
 * Push-first: one /bff/token/{pool} snapshot (stats + top holders) re-loaded on
 * the pool's swap deltas. core/api exposes no /stats/{pool}/holders route — the
 * top holders ride the BFF aggregate.
 */

interface BackendHolder {
  address: string;
  isContract: boolean;
  balance: string;
  balanceFormatted: number;
  pctOfSupply: number;
}

interface RawHolder {
  holderAddress?: string;
  address?: string;
  balance: string;
  pctOfSupply: string | number;
  isContract?: boolean;
}

interface TopHoldersListProps {
  poolAddress: string;
}

export default function TopHoldersList({ poolAddress }: TopHoldersListProps) {
  const [holders, setHolders] = useState<BackendHolder[]>([]);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const [holderCount, setHolderCount] = useState(0);
  const [transferCount, setTransferCount] = useState(0);
  const [top10Conc, setTop10Conc] = useState(0);
  const [creatorPct, setCreatorPct] = useState(0);
  const [creatorCounters, setCreatorCounters] = useState<AddressCounters | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!poolAddress) return;
    try {
      const bff = await fetch(dataApiUrl(`/bff/token/${poolAddress}`)).then(r => (r.ok ? r.json() : null));
      const statsRes = bff?.stats ?? null;
      const holdersRes: RawHolder[] = Array.isArray(bff?.holders) ? bff.holders : [];

      if (statsRes) {
        setHolderCount(statsRes.holderCount ?? 0);
        setTop10Conc(Number(statsRes.top10Concentration ?? 0));
        setCreatorPct(Number(statsRes.creatorHoldingsPct ?? 0));
        setTransferCount(statsRes.transferCount ?? 0);
        if (statsRes.creatorAddress) setCreatorAddress(statsRes.creatorAddress);
      }

      setHolders(
        holdersRes.map((h: RawHolder) => ({
          address: h.holderAddress ?? h.address ?? '',
          isContract: h.isContract ?? false,
          balance: h.balance,
          balanceFormatted: from6dec(h.balance),
          pctOfSupply: Number(h.pctOfSupply ?? 0),
        })),
      );
    } catch {
      /* tolerate transient errors; backstop event will re-load */
    } finally {
      setLoading(false);
    }
  }, [poolAddress]);

  // Initial snapshot.
  useEffect(() => {
    if (!poolAddress) return;
    setLoading(true);
    void load();
  }, [poolAddress, load]);

  // Re-load on the pool's live deltas (push replaces the 30s timer).
  useReloadOnPoolEvent(poolAddress, load);

  useEffect(() => {
    if (!creatorAddress) return;
    fetchAddressCounters(creatorAddress).then(setCreatorCounters).catch(() => {});
  }, [creatorAddress]);

  const displayHolders = showAll ? holders : holders.slice(0, 10);

  return (
    <div className="border border-dark-gray rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-gray">
        <span className="text-size-12 font-manrope-bold text-half-enabled">Holders</span>
        <span className="text-size-10 text-dark-disabled">{holderCount.toLocaleString()} total</span>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 py-2 border-b border-dark-gray">
        <div className="border border-dark-gray rounded-lg p-2 text-center">
          <span className="text-size-8 text-dark-disabled block">Top 10</span>
          <span className="text-size-11 font-manrope-bold text-white">{safeFixed(top10Conc, 1)}%</span>
        </div>
        <div className="border border-dark-gray rounded-lg p-2 text-center">
          <span className="text-size-8 text-dark-disabled block">Creator</span>
          <span className="text-size-11 font-manrope-bold text-white">{safeFixed(creatorPct, 1)}%</span>
        </div>
      </div>

      {creatorCounters && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-dark-gray text-size-9">
          <span className="text-dark-disabled">Creator wallet:</span>
          <span className="text-half-enabled">{creatorCounters.transactionsCount.toLocaleString()} txs</span>
          <span className="text-half-enabled">{creatorCounters.tokenTransfersCount.toLocaleString()} transfers</span>
        </div>
      )}

      {transferCount > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-dark-gray text-size-9">
          <span className="text-dark-disabled">Token transfers:</span>
          <span className="text-half-enabled">{transferCount.toLocaleString()}</span>
        </div>
      )}

      {loading ? (
        <div className="p-4 text-center text-dark-disabled text-size-11 animate-pulse">Loading...</div>
      ) : displayHolders.length === 0 ? (
        <div className="p-4 text-center text-dark-disabled text-size-11">No holders yet</div>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: showAll ? 400 : 260 }}>
          <table className="w-full text-size-10">
            <thead className="sticky top-0 bg-gradient-black-gray">
              <tr className="text-dark-disabled">
                <th className="text-left px-3 py-1.5 w-6">#</th>
                <th className="text-left px-3 py-1.5">Holder</th>
                <th className="text-right px-3 py-1.5">Quantity</th>
                <th className="text-right px-3 py-1.5">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {displayHolders.map((h, i) => {
                const isCreator = creatorAddress && h.address && h.address.toLowerCase() === creatorAddress.toLowerCase();
                return (
                  <tr key={h.address} className={`border-t border-dark-gray/30 hover:bg-dark-gray2/30 ${isCreator ? 'bg-green-middle/5' : ''}`}>
                    <td className="px-3 py-1.5 text-dark-disabled">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`/profile/${h.address}`}
                          className="text-half-enabled hover:text-pink-middle transition"
                        >
                          {formatAddress(h.address, 4)}
                        </a>
                        {isCreator && (
                          <span className="text-size-7 px-1 py-0.5 rounded bg-green-middle/20 text-green-middle font-manrope-bold flex-shrink-0">
                            Creator
                          </span>
                        )}
                        {h.isContract && !isCreator && (
                          <span className="text-size-7 px-1 py-0.5 rounded bg-dark-gray text-dark-disabled font-manrope-bold flex-shrink-0">
                            Contract
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-right px-3 py-1.5 text-white">
                      {formatNumber(h.balanceFormatted, 2)}
                    </td>
                    <td className="text-right px-3 py-1.5 text-white font-manrope-bold">
                      {safeFixed(h.pctOfSupply, 2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {holders.length > 10 && (
        <button
          onClick={() => setShowAll(prev => !prev)}
          className="w-full py-2 text-size-10 text-dark-disabled hover:text-half-enabled transition border-t border-dark-gray"
        >
          {showAll ? 'Show top 10' : `Show all ${holders.length} holders`}
        </button>
      )}
    </div>
  );
}
