'use client';

import { useEffect, useRef, useState } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import type { TransactionReceipt } from 'viem';

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
}

export function useOptimisticReceipt(txHash: `0x${string}` | undefined) {
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

  // Real receipt always wins — cast to OptimisticReceipt shape.
  const receipt = realReceipt
    ? { ...realReceipt, _optimistic: false } as OptimisticReceipt
    : optimistic;

  return { receipt, isOptimistic: receipt?._optimistic ?? false };
}
