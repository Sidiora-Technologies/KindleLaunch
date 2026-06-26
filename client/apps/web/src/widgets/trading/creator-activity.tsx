'use client';

import { useEffect, useState } from 'react';
import { formatAddress, formatPrice } from '@/utils/format';
import { sdkBaseUrls } from '@/core/sdk-config';

interface Transaction {
  id: string;
  poolAddress: string;
  sender: string;
  isBuy: boolean;
  amountIn: string;
  amountOut: string;
  price: string;
  fee: string;
  blockTimestamp: number;
  txHash: string;
}

interface CreatorSummary {
  buyCount: number;
  sellCount: number;
  hasSold: boolean;
  totalBoughtTokens: string;
  totalSoldTokens: string;
  netTokenBalance: string;
}

interface CreatorActivityData {
  poolAddress: string;
  creatorAddress: string | null;
  createdAt: number;
  currentBalance: string;
  currentHoldingsPct: number;
  currentHoldingsPctHuman?: string;
  summary: CreatorSummary;
  transactions: Transaction[];
}

interface CreatorActivityProps {
  poolAddress: string;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function CreatorActivity({ poolAddress }: CreatorActivityProps) {
  const [data, setData] = useState<CreatorActivityData | null>(null);
  const [showTxs, setShowTxs] = useState(false);

  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}/creator-activity`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {}
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [poolAddress]);

  if (!data || !data.creatorAddress) return null;

  const holdingsPct = data.currentHoldingsPctHuman ?? `${Number((data.currentHoldingsPct ?? 0) / 100).toFixed(2)}%`;
  const txs = data.transactions ?? [];
  const displayTxs = showTxs ? txs : txs.slice(0, 5);
  const summary = data.summary ?? { buyCount: 0, sellCount: 0, hasSold: false, totalBoughtTokens: '0', totalSoldTokens: '0', netTokenBalance: '0' };

  return (
    <div className="border border-dark-gray rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-gray">
        <span className="text-size-12 font-manrope-bold text-half-enabled">Creator Activity</span>
        {summary.hasSold && (
          <span className="text-size-8 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-manrope-bold border border-red-500/30">
            HAS SOLD
          </span>
        )}
        {!summary.hasSold && (
          <span className="text-size-8 px-2 py-0.5 rounded-full bg-green-middle/15 text-green-middle font-manrope-bold">
            HOLDING
          </span>
        )}
      </div>

      {/* Creator address + holdings */}
      <div className="px-3 py-2.5 border-b border-dark-gray flex items-center justify-between">
        <a
          href={`/profile/${data.creatorAddress}`}
          className="text-size-10 text-half-enabled hover:text-pink-middle transition font-manrope-bold"
        >
          {formatAddress(data.creatorAddress, 5)}
        </a>
        <div className="text-right">
          <div className="text-size-10 font-manrope-bold text-white">{holdingsPct} held</div>
        </div>
      </div>

      {/* Buy / Sell summary */}
      <div className="grid grid-cols-2 gap-px bg-dark-gray border-b border-dark-gray">
        <div className="bg-black-gray2 px-3 py-2 text-center">
          <div className="text-size-8 text-dark-disabled">Buys</div>
          <div className="text-size-12 font-manrope-bold text-green-middle">{summary.buyCount}</div>
        </div>
        <div className="bg-black-gray2 px-3 py-2 text-center">
          <div className="text-size-8 text-dark-disabled">Sells</div>
          <div className={`text-size-12 font-manrope-bold ${summary.sellCount > 0 ? 'text-red-middle' : 'text-dark-disabled'}`}>
            {summary.sellCount}
          </div>
        </div>
      </div>

      {/* Transaction history */}
      {txs.length > 0 && (
        <>
          <div className="overflow-y-auto" style={{ maxHeight: showTxs ? 300 : 160 }}>
            <table className="w-full text-size-9">
              <thead className="sticky top-0 bg-gradient-black-gray">
                <tr className="text-dark-disabled">
                  <th className="text-left px-3 py-1.5">Type</th>
                  <th className="text-right px-3 py-1.5">Price</th>
                  <th className="text-right px-3 py-1.5">Age</th>
                </tr>
              </thead>
              <tbody>
                {displayTxs.map((tx) => (
                  <tr key={tx.id} className="border-t border-dark-gray/30 hover:bg-dark-gray2/30">
                    <td className="px-3 py-1.5">
                      <a
                        href={`https://paxscan.io/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-manrope-bold hover:opacity-80 transition ${tx.isBuy ? 'text-green-middle' : 'text-red-middle'}`}
                      >
                        {tx.isBuy ? 'BUY' : 'SELL'}
                      </a>
                    </td>
                    <td className="text-right px-3 py-1.5 text-white">
                      {formatPrice(tx.price)}
                    </td>
                    <td className="text-right px-3 py-1.5 text-dark-disabled">
                      {timeAgo(tx.blockTimestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {txs.length > 5 && (
            <button
              onClick={() => setShowTxs((v) => !v)}
              className="w-full py-1.5 text-size-9 text-dark-disabled hover:text-half-enabled transition border-t border-dark-gray"
            >
              {showTxs ? 'Show less' : `Show all ${txs.length} transactions`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
