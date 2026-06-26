'use client';

import { useCallback, useRef, useState } from 'react';
import { formatAddress, formatPrice, formatTokenAmount, formatVolume } from '@/utils/format';
import { usePoolEvents } from '@/core/realtime/use-data-stream';
import { DataChannels, type DataEvent } from '@/core/realtime/data-stream';

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

const MAX_ROWS = 50;

function relTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Coerce a value to string (the gateway humanises bigints to strings already).
function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/**
 * Map a `swap` stream frame to a Transaction. The gateway forwards the indexer
 * webhook envelope ({txHash, logIndex, blockTimestamp, args:{...}}); we read the
 * swap fields from `args`, falling back to the top level in case a flattened
 * payload shape is published. Returns null if the pool does not match (defensive
 * — the socket may be all-pools for swaps, see broker routing note).
 */
function toTransaction(event: DataEvent, poolAddress: string): Transaction | null {
  const env = (event.data ?? {}) as Record<string, unknown>;
  const args = ((env.args as Record<string, unknown>) ?? env) as Record<string, unknown>;

  const pool = str(args.poolAddress ?? env.poolAddress);
  if (pool && pool.toLowerCase() !== poolAddress.toLowerCase()) return null;

  const txHash = str(env.txHash ?? args.txHash);
  const logIndex = str(env.logIndex ?? args.logIndex);
  const ts = Number(args.timestamp ?? env.blockTimestamp ?? args.blockTimestamp ?? 0);

  return {
    id: txHash ? `${txHash}-${logIndex}` : `${pool}-${ts}-${Math.random().toString(36).slice(2, 8)}`,
    poolAddress: pool || poolAddress,
    sender: str(args.sender),
    isBuy: Boolean(args.isBuy),
    amountIn: str(args.amountIn),
    amountOut: str(args.amountOut),
    price: str(args.price),
    fee: str(args.fee),
    blockTimestamp: ts,
    txHash,
  };
}

export default function TxFeed({ poolAddress }: TxFeedProps) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const seen = useRef<Set<string>>(new Set());

  // PUSH-FIRST: live swaps stream in over the multiplexed data socket. core/api
  // exposes no recent-trades REST snapshot (push-first design), so the feed
  // builds up from live deltas; the newest MAX_ROWS are retained.
  const onSwap = useCallback(
    (event: DataEvent) => {
      const tx = toTransaction(event, poolAddress);
      if (!tx) return;
      if (tx.id && seen.current.has(tx.id)) return;
      if (tx.id) seen.current.add(tx.id);
      setTxs((prev) => {
        const next = [tx, ...prev].slice(0, MAX_ROWS);
        // Keep the dedup set bounded to the retained rows.
        if (seen.current.size > MAX_ROWS * 4) {
          seen.current = new Set(next.map((t) => t.id));
        }
        return next;
      });
    },
    [poolAddress],
  );

  usePoolEvents(poolAddress, [DataChannels.Swap], onSwap);

  const visible = txs.filter((t) =>
    filter === 'all' ? true : filter === 'buy' ? t.isBuy : !t.isBuy,
  );

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
        {visible.length === 0 ? (
          <div className="p-4 text-center text-dark-disabled text-size-11">Waiting for live transactions…</div>
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
              {visible.map((tx) => (
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
