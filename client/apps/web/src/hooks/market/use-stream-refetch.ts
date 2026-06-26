'use client';

/**
 * Bridge the multiplexed data-stream (core/api `/ws`) to TanStack Query cache
 * invalidation — the push-first replacement for blind `refetchInterval` polling.
 *
 * The backend pushes only domain events (swap, pool_state_updated, candle_update,
 * fee/optical/config events); it does NOT push a `stats` object. So the correct
 * pattern is: keep the REST snapshot query, drop its timer, and re-validate it
 * when a relevant delta arrives. Invalidation is THROTTLED (leading + trailing,
 * at most once per `throttleMs`) so a burst of swaps cannot melt the snapshot
 * endpoint — this is what makes it safe at 500K users where a single hot pool
 * (or the global firehose) can emit many events per second.
 *
 * `invalidateQueries` only refetches ACTIVE (mounted) queries, so the cost is
 * naturally bounded to what is currently on screen.
 *
 * Two variants:
 *   - `useRefetchOnPoolEvent`  — pool-scoped (a single selected pool / panel).
 *   - `useRefetchOnAnyEvent`   — global firehose (home aggregates: rankings,
 *                                trending strip, batch stats).
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { useDataStream, usePoolEvents } from '@/core/realtime/use-data-stream';
import { DataChannels, type DataChannel, type DataEvent } from '@/core/realtime/data-stream';

/**
 * Returns a throttled function: invokes `fn` immediately on the leading edge,
 * then at most once per `intervalMs`, with a trailing call if events arrived
 * during the cooldown. SSR-safe (timers only run client-side via the caller).
 */
function useThrottledCallback(fn: () => void, intervalMs: number): () => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastRun.current;
    if (elapsed >= intervalMs) {
      lastRun.current = now;
      fnRef.current();
      return;
    }
    // Within cooldown: schedule a single trailing call for the remainder.
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      lastRun.current = Date.now();
      fnRef.current();
    }, intervalMs - elapsed);
  }, [intervalMs]);
}

/** Default channels whose deltas should re-validate a pool's stats snapshot. */
export const STATS_CHANNELS: DataChannel[] = [
  DataChannels.Swap,
  DataChannels.PoolStateUpdated,
];

export interface RefetchOnPoolEventOptions {
  poolAddress: string | undefined | null;
  /** Query key(s) to invalidate (prefix-matched). */
  queryKeys: QueryKey[];
  /** Channels to listen on. Defaults to swap + pool_state_updated. */
  channels?: (DataChannel | string)[];
  /** Minimum ms between refetches (throttle). Default 4s for a single pool. */
  throttleMs?: number;
  enabled?: boolean;
  /** Optional per-event side effect (e.g. push a live trade into a store). */
  onEvent?: (event: DataEvent) => void;
}

/**
 * Re-validate REST snapshot queries for a single pool when its live deltas
 * arrive. Replaces a per-pool `refetchInterval`.
 */
export function useRefetchOnPoolEvent(opts: RefetchOnPoolEventOptions): void {
  const {
    poolAddress,
    queryKeys: keys,
    channels = STATS_CHANNELS,
    throttleMs = 4_000,
    enabled = true,
    onEvent,
  } = opts;

  const qc = useQueryClient();
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const invalidate = useThrottledCallback(() => {
    for (const key of keysRef.current) {
      void qc.invalidateQueries({ queryKey: key });
    }
  }, throttleMs);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const handle = useCallback(
    (event: DataEvent) => {
      onEventRef.current?.(event);
      invalidate();
    },
    [invalidate],
  );

  usePoolEvents(poolAddress, channels, handle, enabled && !!poolAddress);
}

export interface ReloadOnPoolEventOptions {
  channels?: (DataChannel | string)[];
  throttleMs?: number;
  enabled?: boolean;
}

/**
 * Imperative variant for non-React-Query consumers (panels that fetch into local
 * state via useEffect). Calls `reload` (throttled) whenever a matching pool delta
 * arrives — the push replacement for a `setInterval(reload, ...)` timer. The
 * caller still does its own initial load.
 */
export function useReloadOnPoolEvent(
  poolAddress: string | undefined | null,
  reload: () => void,
  opts?: ReloadOnPoolEventOptions,
): void {
  const {
    channels = STATS_CHANNELS,
    throttleMs = 5_000,
    enabled = true,
  } = opts ?? {};

  const throttled = useThrottledCallback(reload, throttleMs);
  usePoolEvents(poolAddress, channels, throttled, enabled && !!poolAddress);
}

export interface RefetchOnAnyEventOptions {
  /** Query key(s) to invalidate (prefix-matched). */
  queryKeys: QueryKey[];
  /** Channels to listen on. Defaults to swap (aggregate ordering changes). */
  channels?: (DataChannel | string)[];
  /** Minimum ms between refetches (throttle). Default 15s for the firehose. */
  throttleMs?: number;
  enabled?: boolean;
}

/**
 * Re-validate aggregate snapshot queries (rankings, trending, batch stats) when
 * ANY pool's deltas arrive. The throttle is wider here because this rides the
 * global firehose. Subscribing with no pool filter forces the shared socket to
 * all-pools (handled by data-stream); the per-consumer filter is "none".
 */
export function useRefetchOnAnyEvent(opts: RefetchOnAnyEventOptions): void {
  const {
    queryKeys: keys,
    channels = [DataChannels.Swap],
    throttleMs = 15_000,
    enabled = true,
  } = opts;

  const qc = useQueryClient();
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const invalidate = useThrottledCallback(() => {
    for (const key of keysRef.current) {
      void qc.invalidateQueries({ queryKey: key });
    }
  }, throttleMs);

  useDataStream({
    channels: channels as string[],
    // No `pools` => all pools (firehose).
    onEvent: invalidate,
    enabled,
  });
}

export interface ReloadOnAnyEventOptions {
  channels?: (DataChannel | string)[];
  throttleMs?: number;
  enabled?: boolean;
}

/**
 * Imperative global-firehose variant for non-React-Query consumers (e.g. a
 * watchlist enrich that fetches a batch into local state). Calls `reload`
 * (throttled) on any matching delta — the push replacement for a fixed timer.
 */
export function useReloadOnAnyEvent(
  reload: () => void,
  opts?: ReloadOnAnyEventOptions,
): void {
  const {
    channels = [DataChannels.Swap],
    throttleMs = 15_000,
    enabled = true,
  } = opts ?? {};

  const throttled = useThrottledCallback(reload, throttleMs);
  useDataStream({ channels: channels as string[], onEvent: throttled, enabled });
}
