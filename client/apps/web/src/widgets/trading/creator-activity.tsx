'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { formatAddress, formatPrice } from '@/utils/format';
import { useTokenStats } from '@/hooks/market/use-token-stats';
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

interface CreatorSummary {
  buyCount: number;
  sellCount: number;
  hasSold: boolean;
  totalBoughtTokens: string;
  totalSoldTokens: string;
  netTokenBalance: string;
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

const MAX_CREATOR_TXS = 50;

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

export default function CreatorActivity({ poolAddress }: CreatorActivityProps) {
  const [showTxs, setShowTxs] = useState(false);
  const [creatorTxs, setCreatorTxs] = useState<Transaction[]>([]);
  const seen = useRef<Set<string>>(new Set());

  // Creator identity + current holdings come from the push-first pool stats.
  // core/api exposes no /stats/{pool}/creator-activity route, so the buy/sell
  // history is accumulated live from the swap stream (creator == sender).
  const { data: stats } = useTokenStats(poolAddress);
  const creatorAddress = stats?.creatorAddress ?? null;

  const onSwap = useCallback(
    (event: DataEvent) => {
      if (!creatorAddress) return;
      const env = (event.data ?? {}) as Record<string, unknown>;
      const args = ((env.args as Record<string, unknown>) ?? env) as Record<string, unknown>;
      const sender = str(args.sender);
      if (!sender || sender.toLowerCase() !== creatorAddress.toLowerCase()) return;

      const txHash = str(env.txHash ?? args.txHash);
      const logIndex = str(env.logIndex ?? args.logIndex);
      const ts = Number(args.timestamp ?? env.blockTimestamp ?? args.blockTimestamp ?? 0);
      const id = txHash ? `${txHash}-${logIndex}` : `${sender}-${ts}-${Math.random().toString(36).slice(2, 8)}`;
      if (seen.current.has(id)) return;
      seen.current.add(id);

      const tx: Transaction = {
        id,
        poolAddress,
        sender,
        isBuy: Boolean(args.isBuy),
        amountIn: str(args.amountIn),
        amountOut: str(args.amountOut),
        price: str(args.price),
        fee: str(args.fee),
        blockTimestamp: ts,
        txHash,
      };
      setCreatorTxs((prev) => {
        const next = [tx, ...prev].slice(0, MAX_CREATOR_TXS);
        if (seen.current.size > MAX_CREATOR_TXS * 4) seen.current = new Set(next.map((t) => t.id));
        return next;
      });
    },
    [creatorAddress, poolAddress],
  );

  usePoolEvents(poolAddress, [DataChannels.Swap], onSwap, !!poolAddress && !!creatorAddress);

  const summary = useMemo<CreatorSummary>(() => {
    const buyCount = creatorTxs.filter((t) => t.isBuy).length;
    const sellCount = creatorTxs.length - buyCount;
    return {
      buyCount,
      sellCount,
      hasSold: sellCount > 0,
      totalBoughtTokens: '0',
      totalSoldTokens: '0',
      netTokenBalance: '0',
    };
  }, [creatorTxs]);

  if (!creatorAddress) return null;

  const holdingsPct = stats?.creatorHoldingsPct ? `${stats.creatorHoldingsPct}%` : '—';
  const txs = creatorTxs;
  const displayTxs = showTxs ? txs : txs.slice(0, 5);

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
          href={`/profile/${creatorAddress}`}
          className="text-size-10 text-half-enabled hover:text-pink-middle transition font-manrope-bold"
        >
          {formatAddress(creatorAddress, 5)}
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
