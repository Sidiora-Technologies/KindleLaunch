'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePoolEvents } from '@/core/realtime/use-data-stream';
import { DataChannels, type DataEvent } from '@/core/realtime/data-stream';
import type { WsStatus } from '@/core/realtime/ws-manager';
import { dataApiUrl } from '@/core/sdk-config';

export interface PoolTrade {
  id: string;
  sender: string;
  isBuy: boolean;
  amountIn: string;
  amountOut: string;
  price: string;
  blockTimestamp: number;
  txHash?: string;
  fee?: string;
}

type TradeFilter = 'all' | 'buy' | 'sell';

const MAX_TRADES = 50;

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** Map a `swap` stream frame (webhook envelope or flattened) to a PoolTrade. */
function toTrade(event: DataEvent, poolAddress: string): PoolTrade | null {
  const env = (event.data ?? {}) as Record<string, unknown>;
  const args = ((env.args as Record<string, unknown>) ?? env) as Record<string, unknown>;

  const pool = str(args.poolAddress ?? env.poolAddress);
  if (pool && pool.toLowerCase() !== poolAddress.toLowerCase()) return null;

  const txHash = str(env.txHash ?? args.txHash);
  const logIndex = str(env.logIndex ?? args.logIndex);
  const ts = Number(args.timestamp ?? env.blockTimestamp ?? args.blockTimestamp ?? 0);

  return {
    id: txHash ? `${txHash}-${logIndex}` : `${pool}-${ts}-${Math.random().toString(36).slice(2, 8)}`,
    sender: str(args.sender),
    isBuy: Boolean(args.isBuy),
    amountIn: str(args.amountIn),
    amountOut: str(args.amountOut),
    price: str(args.price),
    fee: str(args.fee),
    blockTimestamp: ts,
    txHash: txHash || undefined,
  };
}

/**
 * Live pool trades via the multiplexed data stream (push-first), seeded once
 * from the core/api `/bff/token/:pool/trades` REST snapshot so the list is
 * populated before the first live swap (Bug 3). Accumulates the newest
 * `MAX_TRADES` swaps for the pool. Returns a useQuery-compatible-ish shape
 * (`data` + connection status).
 */
export function usePoolTrades(
  poolAddress: string,
  filter: TradeFilter = 'all',
  opts?: { enabled?: boolean },
): { data: PoolTrade[]; status: WsStatus; isLoading: boolean } {
  const [trades, setTrades] = useState<PoolTrade[]>([]);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  // One-shot REST bootstrap snapshot: backfill the most-recent swaps so the list
  // is populated before the first live swap arrives (Bug 3). Not a poll loop —
  // it runs once per poolAddress; live deltas then ride the push stream below.
  useEffect(() => {
    if (opts?.enabled === false || !poolAddress) return;
    let cancelled = false;
    setSnapshotLoaded(false);
    (async () => {
      try {
        const res = await fetch(dataApiUrl(`/bff/token/${poolAddress}/trades`));
        if (!res.ok) throw new Error(`trades snapshot ${res.status}`);
        const json = (await res.json()) as { trades?: PoolTrade[] };
        if (cancelled) return;
        const snapshot = (json.trades ?? []).slice(0, MAX_TRADES);
        seen.current = new Set(snapshot.map((t) => t.id));
        setTrades(snapshot);
      } catch {
        // Snapshot is best-effort; live deltas still populate the list.
      } finally {
        if (!cancelled) setSnapshotLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poolAddress, opts?.enabled]);

  const onSwap = useCallback(
    (event: DataEvent) => {
      const t = toTrade(event, poolAddress);
      if (!t) return;
      if (t.id && seen.current.has(t.id)) return;
      if (t.id) seen.current.add(t.id);
      setTrades((prev) => {
        const next = [t, ...prev].slice(0, MAX_TRADES);
        if (seen.current.size > MAX_TRADES * 4) {
          seen.current = new Set(next.map((x) => x.id));
        }
        return next;
      });
    },
    [poolAddress],
  );

  const status = usePoolEvents(
    poolAddress,
    [DataChannels.Swap],
    onSwap,
    opts?.enabled !== false,
  );

  const data = useMemo(
    () =>
      trades.filter((t) =>
        filter === 'all' ? true : filter === 'buy' ? t.isBuy : !t.isBuy,
      ),
    [trades, filter],
  );

  return { data, status, isLoading: !snapshotLoaded && trades.length === 0 };
}
