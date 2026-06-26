'use client';

import { useState, useEffect } from 'react';
import { formatAddress, formatPrice, formatTokenAmount, formatVolume } from '@/utils/format';
import { sdkBaseUrls } from '@/core/sdk-config';
import { reportError } from '@/core/report-error';

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

interface TxFeedProps {
  poolAddress: string;
}

type Filter = 'all' | 'buy' | 'sell';

const FILTER_LABELS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'buy', label: 'Buys' },
  { key: 'sell', label: 'Sells' },
];

function relTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function TxFeed({ poolAddress }: TxFeedProps) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;

    async function fetchTxs() {
      try {
        const url = `${sdkBaseUrls.stats}/stats/${poolAddress}/transactions?limit=50&type=${filter}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTxs(data.transactions ?? []);
      } catch (error) {
        reportError(error, { area: 'tx-feed', action: 'fetchTxs', poolAddress });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTxs();
    const interval = setInterval(fetchTxs, 5_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [poolAddress, filter]);

  return (
    <div className="border border-dark-gray rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-gray">
        <span className="text-size-12 font-manrope-bold text-half-enabled">Live Transactions</span>
        <div className="flex gap-1 ml-auto">
          {FILTER_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-2.5 py-1 rounded text-size-10 font-manrope-bold transition ${
                filter === key ? 'bg-pink-opacity-1 text-pink-middle' : 'text-dark-disabled hover:text-half-enabled'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-dark-disabled text-size-11 animate-pulse">Loading...</div>
        ) : txs.length === 0 ? (
          <div className="p-4 text-center text-dark-disabled text-size-11">No transactions yet</div>
        ) : (
          <table className="w-full text-size-10">
            <thead className="sticky top-0 bg-gradient-black-gray">
              <tr className="text-dark-disabled">
                <th className="text-left px-3 py-1.5">Type</th>
                <th className="text-left px-3 py-1.5">Wallet</th>
                <th className="text-right px-3 py-1.5">Amount In</th>
                <th className="text-right px-3 py-1.5">Amount Out</th>
                <th className="text-right px-3 py-1.5">Price</th>
                <th className="text-right px-3 py-1.5">Time</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.id} className="border-t border-dark-gray/50 hover:bg-dark-gray2/30">
                  <td className={`px-3 py-1.5 font-manrope-bold ${tx.isBuy ? 'text-green-middle' : 'text-red-middle'}`}>
                    {tx.isBuy ? 'Buy' : 'Sell'}
                  </td>
                  <td className="px-3 py-1.5">
                    <a
                      href={`https://paxscan.paxeer.app/address/${tx.sender}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-half-enabled hover:text-pink-middle transition"
                    >
                      {formatAddress(tx.sender, 4)}
                    </a>
                  </td>
                  <td className="text-right px-3 py-1.5 text-white">
                    {tx.isBuy ? formatVolume(tx.amountIn) : formatTokenAmount(tx.amountIn)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-white">
                    {tx.isBuy ? formatTokenAmount(tx.amountOut) : formatVolume(tx.amountOut)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-half-enabled">
                    {formatPrice(tx.price)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-dark-disabled text-size-9">
                    {relTime(tx.blockTimestamp)}
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
