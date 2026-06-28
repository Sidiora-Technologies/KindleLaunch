'use client';

import { useEffect, useRef, useState } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import type { TransactionReceipt } from 'viem';
import { useDataStream } from '@/core/realtime/use-data-stream';
import { DataChannels, type DataEvent } from '@/core/realtime/data-stream';

/**
 * Drop-in replacement for wagmi's `useWaitForTransactionReceipt` that adds an
 * optimistic-success fallback for RPC nodes that silently swallow receipts.
 *
 * Behaviour:
 *  1. Starts `useWaitForTransactionReceipt` as normal.
 *  2. Once a `txHash` is present, also starts a `OPTIMISTIC_DELAY_MS` timer.
 *  3. If the real receipt arrives before the timer fires → use it as-is (handles
 *     both success and revert correctly).
 *  4. If the timer fires first (node hung / no response) → synthesise a
 *     success receipt so the UI can unblock. The synthetic receipt is flagged
 *     with `_optimistic: true` so callers can skip balance-refetch retries
 *     if they choose to.
 *  5. If the real receipt arrives AFTER the optimistic one was emitted → the
 *     hook silently replaces it (React will re-run effects; callers should be
 *     idempotent on success).
 */

// Configurable via NEXT_PUBLIC_OPTIMISTIC_RECEIPT_MS env var (3.8)
const OPTIMISTIC_DELAY_MS = Number(process.env.NEXT_PUBLIC_OPTIMISTIC_RECEIPT_MS) || 2_000;

export interface OptimisticReceipt extends Partial<TransactionReceipt> {
  transactionHash: `0x${string}`;
  status: 'success' | 'reverted';
  /** True when this receipt was synthesised by the optimistic timeout, not confirmed on-chain. */
  _optimistic?: boolean;
  /** True when confirmation came from a matching indexer stream event (authoritative). */
  _streamConfirmed?: boolean;
}

/**
 * Optional push-first confirmation: when the indexer emits the matching event
 * (swap for a trade, market_created for a launch) for this `poolAddress`, the
 * receipt resolves immediately and authoritatively — faster and more reliable
 * than waiting out the optimistic timer on an RPC that swallows receipts. The
 * event is matched on its embedded tx hash when present (no false positives).
 */
export interface StreamConfirm {
  poolAddress?: string | null;
  channels?: string[];
  enabled?: boolean;
}

function eventTxHash(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const direct = d.txHash ?? d.transactionHash ?? d.tx_hash;
  if (typeof direct === 'string') return direct;
  const args = d.args as Record<string, unknown> | undefined;
  const nested = args?.txHash ?? args?.transactionHash ?? args?.tx_hash;
  return typeof nested === 'string' ? nested : undefined;
}

export function useOptimisticReceipt(
  txHash: `0x${string}` | undefined,
  confirm?: StreamConfirm,
) {
  const { data: realReceipt } = useWaitForTransactionReceipt({ hash: txHash });
  const [optimistic, setOptimistic] = useState<OptimisticReceipt | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // New hash in — reset any stale optimistic receipt.
    setOptimistic(null);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    if (!txHash) return;

    timerRef.current = setTimeout(() => {
      // Only emit optimistic if the real receipt hasn't arrived yet.
      setOptimistic((prev) => prev ?? {
        transactionHash: txHash,
        status: 'success',
        _optimistic: true,
      });
    }, OPTIMISTIC_DELAY_MS);

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [txHash]);

  // Authoritative confirmation off the indexer stream (swap / market_created).
  // The stream arm enables on a pool match OR a channel-only match (e.g. the
  // create receipt confirms against market_created before the pool exists): the
  // event is matched on its embedded tx hash, so a pool-less subscription has no
  // false positives. Subscribing via useDataStream (not usePoolEvents) so a
  // pool-less channel subscription is permitted (Bug 1).
  useDataStream({
    channels: confirm?.channels ?? [DataChannels.Swap, DataChannels.MarketCreated],
    pools: confirm?.poolAddress ? [confirm.poolAddress] : undefined,
    onEvent: (event: DataEvent) => {
      if (!txHash) return;
      const evHash = eventTxHash(event.data);
      // Match on tx hash when the payload carries it; otherwise ignore to avoid
      // confirming the wrong in-flight tx on a busy pool.
      if (!evHash || evHash.toLowerCase() !== txHash.toLowerCase()) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setOptimistic({
        transactionHash: txHash,
        status: 'success',
        _optimistic: false,
        _streamConfirmed: true,
      });
    },
    enabled:
      (confirm?.enabled ?? true) &&
      !!txHash &&
      (!!confirm?.poolAddress || (confirm?.channels?.length ?? 0) > 0),
  });

  // Real receipt always wins — cast to OptimisticReceipt shape.
  const receipt = realReceipt
    ? { ...realReceipt, _optimistic: false } as OptimisticReceipt
    : optimistic;

  return { receipt, isOptimistic: receipt?._optimistic ?? false };
}
