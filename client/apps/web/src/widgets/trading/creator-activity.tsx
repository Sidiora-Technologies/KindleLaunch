'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatAddress, formatPrice } from '@/utils/format';
import { dataApiUrl } from '@/core/sdk-config';
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
  const [snapshotTxs, setSnapshotTxs] = useState<Transaction[]>([]);
  const [baseSummary, setBaseSummary] = useState<CreatorSummary | null>(null);
  const [liveTxs, setLiveTxs] = useState<Transaction[]>([]);
  const [holdingsPctNum, setHoldingsPctNum] = useState<number | null>(null);
  const seen = useRef<Set<string>>(new Set());

  // Creator identity + current holdings come from the push-first pool stats.
  const { data: stats } = useTokenStats(poolAddress);
  const creatorAddress = stats?.creatorAddress ?? null;

  // Seed the full historical buy/sell summary + transactions once from the
  // core/api creator-activity route so counts are real (not 0/0); live swaps
  // then increment in real time on top of this baseline (Bug 5).
  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(dataApiUrl(`/bff/token/${poolAddress}/creator-activity`));
        if (!res.ok) throw new Error(`creator-activity ${res.status}`);
        const json = (await res.json()) as {
          summary?: CreatorSummary | null;
          transactions?: Array<Partial<Transaction>>;
          currentHoldingsPct?: number;
        };
        if (cancelled) return;
        const txs: Transaction[] = (json.transactions ?? []).map((t) => ({
          id: str(t.id),
          poolAddress,
          sender: str(t.sender),
          isBuy: Boolean(t.isBuy),
          amountIn: str(t.amountIn),
          amountOut: str(t.amountOut),
          price: str(t.price),
          fee: str(t.fee),
          blockTimestamp: Number(t.blockTimestamp ?? 0),
          txHash: str(t.txHash),
        }));
        seen.current = new Set(txs.map((t) => t.id));
        setSnapshotTxs(txs);
        setBaseSummary(json.summary ?? null);
        setHoldingsPctNum(typeof json.currentHoldingsPct === 'number' ? json.currentHoldingsPct : null);
        setLiveTxs([]);
      } catch {
        // Snapshot is best-effort; live deltas still accumulate below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poolAddress]);

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
      setLiveTxs((prev) => [tx, ...prev].slice(0, MAX_CREATOR_TXS));
    },
    [creatorAddress, poolAddress],
  );

  usePoolEvents(poolAddress, [DataChannels.Swap], onSwap, !!poolAddress && !!creatorAddress);

  // Combined summary: the historical baseline from the snapshot plus live deltas
  // not present in it (token totals folded with BigInt, never float).
  const summary = useMemo<CreatorSummary>(() => {
    let buyCount = baseSummary?.buyCount ?? 0;
    let sellCount = baseSummary?.sellCount ?? 0;
    let bought = BigInt(baseSummary?.totalBoughtTokens || '0');
    let sold = BigInt(baseSummary?.totalSoldTokens || '0');
    for (const t of liveTxs) {
      if (t.isBuy) {
        buyCount += 1;
        try { bought += BigInt(t.amountOut || '0'); } catch { /* skip non-numeric */ }
      } else {
        sellCount += 1;
        try { sold += BigInt(t.amountIn || '0'); } catch { /* skip non-numeric */ }
      }
    }
    return {
      buyCount,
      sellCount,
      hasSold: sellCount > 0,
      totalBoughtTokens: bought.toString(),
      totalSoldTokens: sold.toString(),
      netTokenBalance: (bought - sold).toString(),
    };
  }, [baseSummary, liveTxs]);

  if (!creatorAddress) return null;

  // Prefer the creator-activity route's human-percent holdings (single-point
  // bps->percent conversion); fall back to '—' when unavailable (Bug 5).
  const holdingsPct = holdingsPctNum !== null ? `${holdingsPctNum}%` : '—';
  const txs = [...liveTxs, ...snapshotTxs];
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
