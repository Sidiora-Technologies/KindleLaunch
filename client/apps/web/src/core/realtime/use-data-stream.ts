'use client';

/**
 * React bindings for the multiplexed data-stream (core/api `/ws`).
 *
 * `useDataStream` is the low-level hook: it subscribes for the component's
 * lifetime and invokes `onEvent` for each matching delta. The callback is held
 * in a ref so a consumer can pass an inline closure without re-subscribing every
 * render; the subscription only re-registers when the channel/pool identity
 * changes.
 *
 * `usePoolEvents` is the common case: live deltas for a single pool across a set
 * of channels.
 *
 * SSR-safe: the underlying `subscribe` no-ops without a DOM, and the effect only
 * runs on the client.
 */

import { useEffect, useRef, useState } from 'react';
import { subscribe, DataChannels, type DataEvent, type DataChannel } from './data-stream';
import type { WsStatus } from './ws-manager';

export interface UseDataStreamOptions {
  channels?: string[];
  pools?: string[];
  onEvent: (event: DataEvent) => void;
  /** Pause the subscription without unmounting (e.g. tab not active). */
  enabled?: boolean;
}

/**
 * Subscribe to the shared data-stream for this component's lifetime. Returns the
 * current shared-socket status for optional connection indicators.
 */
export function useDataStream(opts: UseDataStreamOptions): WsStatus {
  const { channels, pools, enabled = true } = opts;
  const [status, setStatus] = useState<WsStatus>('idle');

  // Hold the latest callback in a ref so an inline closure does not churn the
  // subscription every render.
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;

  // Stable identity keys so we only re-subscribe when the filter truly changes.
  const channelsKey = channels ? [...channels].sort().join(',') : '';
  const poolsKey = pools ? [...pools].map((p) => p.toLowerCase()).sort().join(',') : '';

  useEffect(() => {
    if (!enabled) return;
    const handle = subscribe({
      channels,
      pools,
      onEvent: (e) => onEventRef.current(e),
      onStatusChange: setStatus,
    });
    return () => handle.unsubscribe();
    // channels/pools are intentionally tracked via their serialised keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelsKey, poolsKey, enabled]);

  return status;
}

/** Live deltas for a single pool across the given channels. */
export function usePoolEvents(
  poolAddress: string | undefined | null,
  channels: DataChannel[] | string[],
  onEvent: (event: DataEvent) => void,
  enabled = true,
): WsStatus {
  return useDataStream({
    channels: channels as string[],
    pools: poolAddress ? [poolAddress] : undefined,
    onEvent,
    enabled: enabled && !!poolAddress,
  });
}

/**
 * Live price for a pool from the candle stream (the `close` of the latest 1m
 * bar). Returns the server-formatted display price (8dp float) or null until the
 * first tick. This is read-only display data — it does NOT mutate any cached
 * stats money fields (avoiding float-vs-bigint precision corruption), so it can
 * be composed alongside a REST stats snapshot.
 */
export function useLivePrice(
  poolAddress: string | undefined | null,
  timeframe = '1m',
  enabled = true,
): number | null {
  const [price, setPrice] = useState<number | null>(null);
  usePoolEvents(
    poolAddress,
    [DataChannels.CandleUpdate],
    (event) => {
      const d = event.data as { timeframe?: string; close?: number } | undefined;
      if (!d || d.timeframe !== timeframe) return;
      if (typeof d.close === 'number') setPrice(d.close);
    },
    enabled,
  );
  return price;
}
