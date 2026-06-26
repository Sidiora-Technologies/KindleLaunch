/**
 * Multiplexed real-time DATA stream client (core/api `/ws`).
 *
 * The push-first backend fans every indexer event out over a single multiplexed
 * WebSocket: a client opens one socket and sends
 *   {"type":"subscribe","channels":["indexer:swap",...],"pools":["0x..",...]}
 * then receives a uniform envelope per event:
 *   {"type":<event>,"channel":<redis-channel>,"pool":<addr>,"data":<payload>}
 * (the candle channel keeps its trading-charts shape: {"type":"candle_update",
 * "data":{...}} with no top-level channel/pool — the pool lives in data).
 *
 * This module owns ONE shared connection for the whole app and multiplexes many
 * React consumers onto it (mirroring the chat-ws consumer-map pattern), built on
 * the resilient WsManager backbone (pong-watchdog dead-conn detection, backoff +
 * circuit breaker, rAF coalescing of state ticks, page-visibility resync).
 *
 * Subscription model (matches the broker's connection-wide filter semantics —
 * one {channels, pools} filter per socket; empty pools = all pools; pool-less
 * "global" events always deliver):
 *
 *   - The connection's channel set is the UNION of every active consumer's
 *     channels.
 *   - The connection's pool set is the UNION of consumers' pools, UNLESS any
 *     active consumer wants a channel with NO pool filter (i.e. all pools) — in
 *     which case the socket subscribes to ALL pools and the per-consumer pool
 *     filter is applied CLIENT-SIDE on dispatch. This guarantees no consumer is
 *     ever starved of events another consumer's narrower pool filter would have
 *     excluded.
 *
 * On every (re)connect the full union subscribe frame is re-sent (snapshot+delta
 * resync). A consumer that needs an initial REST snapshot pulls it itself in its
 * own onSubscribed/effect; this module is delta-only.
 *
 * SSR-safe: all methods no-op without a DOM/WebSocket.
 */

import { WsManager, type WsStatus } from './ws-manager';
import { reportError } from '@/core/report-error';
import { dataWsUrl } from '@/core/sdk-config';

// Redis channel names — byte-identical to shared/constants channels.ts /
// constants.go (invariant i5). These are what a consumer subscribes to.
export const DataChannels = {
  Swap: 'indexer:swap',
  MarketCreated: 'indexer:market_created',
  PoolStateUpdated: 'indexer:pool_state_updated',
  FeeRecorded: 'indexer:fee_recorded',
  FeeDistributed: 'indexer:fee_distributed',
  FeeStrategyChanged: 'indexer:fee_strategy_changed',
  OpticalExecuted: 'indexer:optical_executed',
  ConfigUpdated: 'indexer:config_updated',
  CandleUpdate: 'candles:update',
} as const;

export type DataChannel = (typeof DataChannels)[keyof typeof DataChannels];

const ALL_CHANNELS: string[] = Object.values(DataChannels);

// Control/keepalive frames the server sends that are NOT domain events.
const CONTROL_TYPES = new Set([
  'connected',
  'subscribed',
  'unsubscribed',
  'ping',
  'pong',
  'error',
]);

/** A fan-out event delivered to consumers. */
export interface DataEvent<T = unknown> {
  /** De-prefixed event name: 'swap' | 'market_created' | 'candle_update' | ... */
  type: string;
  /** Originating Redis channel (absent on candle frames; derived for routing). */
  channel?: string;
  /** Pool address (lowercased) or undefined for global events. */
  pool?: string;
  /** The raw event payload. */
  data: T;
}

/** A consumer's declared interest. */
export interface DataSubscription {
  /** Channels to receive. Defaults to all channels when omitted/empty. */
  channels?: string[];
  /**
   * Pool filter. Omit/empty => ALL pools (and forces the shared socket to
   * subscribe to all pools). Addresses are matched case-insensitively.
   */
  pools?: string[];
  /** Delta handler. Throwing is caught + reported (never tears down the socket). */
  onEvent: (event: DataEvent) => void;
  /** Optional connection-status observer (shared socket status). */
  onStatusChange?: (status: WsStatus) => void;
  /** Optional error observer. */
  onError?: (message: string) => void;
}

/** Handle returned by `subscribe`; call `unsubscribe()` on unmount. */
export interface DataStreamHandle {
  unsubscribe: () => void;
}

interface Consumer {
  id: number;
  channels: Set<string>;
  /** Lowercased pool set; null => all pools. */
  pools: Set<string> | null;
  onEvent: (event: DataEvent) => void;
  onStatusChange?: (status: WsStatus) => void;
  onError?: (message: string) => void;
}

interface InboundFrame {
  type: string;
  channel?: string;
  pool?: string;
  data?: unknown;
}

// Map raw event type -> the channel it came from, for candle frames (which omit
// the channel field) and as a fallback when the server elides it.
const TYPE_TO_CHANNEL: Record<string, string> = {
  swap: DataChannels.Swap,
  market_created: DataChannels.MarketCreated,
  pool_state_updated: DataChannels.PoolStateUpdated,
  fee_recorded: DataChannels.FeeRecorded,
  fee_distributed: DataChannels.FeeDistributed,
  fee_strategy_changed: DataChannels.FeeStrategyChanged,
  optical_executed: DataChannels.OpticalExecuted,
  config_updated: DataChannels.ConfigUpdated,
  candle_update: DataChannels.CandleUpdate,
};

const consumers = new Map<number, Consumer>();
let nextConsumerId = 0;
let manager: WsManager<InboundFrame> | null = null;
let sharedStatus: WsStatus = 'idle';

// The filter currently applied on the SERVER socket. The server ACCUMULATES
// subscribe/unsubscribe frames (it does not replace its filter), so we track
// exactly what it holds and reconcile with add/remove deltas. `appliedAllPools`
// means the server's pool set is empty (= all pools); `appliedPools` is then
// empty.
let appliedChannels = new Set<string>();
let appliedAllPools = false;
let appliedPools = new Set<string>();

function normalizePools(pools?: string[]): Set<string> | null {
  if (!pools || pools.length === 0) return null; // all pools
  const s = new Set<string>();
  for (const p of pools) {
    if (p) s.add(p.toLowerCase());
  }
  return s.size ? s : null;
}

/**
 * Compute the union filter across all consumers.
 *   channels = union of every consumer's channels
 *   pools    = union of consumer pools, OR all-pools if any consumer wants all
 */
function computeUnion(): { channels: string[]; allPools: boolean; pools: string[] } {
  const channels = new Set<string>();
  const pools = new Set<string>();
  let allPools = false;
  for (const c of consumers.values()) {
    for (const ch of c.channels) channels.add(ch);
    if (c.pools === null) {
      allPools = true;
    } else {
      for (const p of c.pools) pools.add(p);
    }
  }
  return {
    channels: Array.from(channels),
    allPools,
    pools: allPools ? [] : Array.from(pools),
  };
}

/**
 * Reconcile the SERVER socket's accumulated filter with the desired union.
 *
 * When `forceResend` is true (after a (re)connect) the server state is fresh, so
 * we send the full desired filter as one subscribe frame. Otherwise we send the
 * minimal add (`subscribe`) / remove (`unsubscribe`) deltas, honouring the
 * empty-pools=all-pools rule:
 *   - want all, server restricted  -> unsubscribe the restricting pools (clear).
 *   - want restricted, server all  -> subscribe the concrete pools (restrict).
 */
function syncSubscription(forceResend = false): void {
  const union = computeUnion();
  const desiredChannels = new Set(union.channels);
  const desiredAllPools = union.allPools;
  const desiredPools = new Set(union.pools); // empty when desiredAllPools

  const send = (d: unknown) => manager?.send(d);

  if (forceResend) {
    appliedChannels = desiredChannels;
    appliedAllPools = desiredAllPools;
    appliedPools = desiredPools;
    if (desiredChannels.size === 0) return;
    send({
      type: 'subscribe',
      channels: [...desiredChannels],
      pools: desiredAllPools ? [] : [...desiredPools],
    });
    return;
  }

  const addChannels = [...desiredChannels].filter((c) => !appliedChannels.has(c));
  const removeChannels = [...appliedChannels].filter((c) => !desiredChannels.has(c));

  let addPools: string[] = [];
  let removePools: string[] = [];
  if (desiredAllPools && !appliedAllPools) {
    removePools = [...appliedPools]; // clear the restriction -> all pools
  } else if (!desiredAllPools && appliedAllPools) {
    addPools = [...desiredPools]; // restrict from all -> concrete pools
  } else if (!desiredAllPools && !appliedAllPools) {
    addPools = [...desiredPools].filter((p) => !appliedPools.has(p));
    removePools = [...appliedPools].filter((p) => !desiredPools.has(p));
  }

  if (addChannels.length || addPools.length) {
    send({ type: 'subscribe', channels: addChannels, pools: addPools });
  }
  if (removeChannels.length || removePools.length) {
    send({ type: 'unsubscribe', channels: removeChannels, pools: removePools });
  }

  appliedChannels = desiredChannels;
  appliedAllPools = desiredAllPools;
  appliedPools = desiredPools;
}

function setStatus(status: WsStatus): void {
  sharedStatus = status;
  for (const c of consumers.values()) c.onStatusChange?.(status);
}

/**
 * Resolve a frame's pool address from any of the shapes the gateway may emit:
 *   - top-level `pool` (broker's flattened routing field)
 *   - `data.poolAddress` (candle frames; flattened swap payloads)
 *   - `data.args.poolAddress` (the webhook-envelope shape the indexer publishes)
 * This is defensive against the known broker-vs-publisher payload discrepancy on
 * the indexer:* channels (top-level vs args-nested poolAddress); it does not
 * paper over it — the gap is flagged separately for the backend.
 */
function resolvePool(frame: InboundFrame): string | undefined {
  if (frame.pool) return frame.pool;
  const data = frame.data;
  if (data && typeof data === 'object') {
    const top = (data as { poolAddress?: unknown }).poolAddress;
    if (typeof top === 'string' && top) return top;
    const args = (data as { args?: { poolAddress?: unknown } }).args;
    if (args && typeof args === 'object' && typeof args.poolAddress === 'string' && args.poolAddress) {
      return args.poolAddress;
    }
  }
  return undefined;
}

function dispatch(frame: InboundFrame): void {
  if (CONTROL_TYPES.has(frame.type)) return; // keepalive / acks / errors

  const channel = frame.channel ?? TYPE_TO_CHANNEL[frame.type];
  const pool = resolvePool(frame);
  const poolLc = pool ? pool.toLowerCase() : undefined;

  const event: DataEvent = { type: frame.type, channel, pool: poolLc, data: frame.data };

  for (const c of consumers.values()) {
    // Channel match (a consumer with no channel of this kind is skipped).
    if (channel && !c.channels.has(channel)) continue;
    if (!channel && c.channels.size > 0) {
      // Unknown channel + a non-wildcard consumer: skip to avoid mis-routing.
      continue;
    }
    // Per-consumer pool filter (client-side; the socket may be all-pools).
    if (c.pools !== null && poolLc && !c.pools.has(poolLc)) continue;
    try {
      c.onEvent(event);
    } catch (err) {
      reportError(err, { area: 'data-stream', action: 'onEvent', type: frame.type });
    }
  }
}

function ensureManager(): WsManager<InboundFrame> {
  if (manager) return manager;
  manager = new WsManager<InboundFrame>({
    url: dataWsUrl,
    onMessage: (frame) => {
      try {
        dispatch(frame);
      } catch (err) {
        reportError(err, { area: 'data-stream', action: 'dispatch' });
      }
    },
    // Snapshot+delta: on every (re)connect the server state is fresh, so re-send
    // the full union subscribe.
    onResync: () => syncSubscription(true),
    onStatusChange: setStatus,
    onError: (msg) => {
      for (const c of consumers.values()) c.onError?.(msg);
    },
    // Indexer state ticks (pool_state_updated, candle_update) are coalesced
    // latest-per-key under burst; discrete events (swap, market_created, fees)
    // get a unique key so they are never dropped.
    coalesce: { key: coalesceKey, maxBuffer: 10_000 },
  });
  return manager;
}

let discreteSeq = 0;
const COALESCABLE = new Set<string>([DataChannels.CandleUpdate, DataChannels.PoolStateUpdated]);

/** Coalescing key: latest-per-(channel,pool[,timeframe]) for state ticks; a
 *  unique key per discrete event so must-deliver frames are never collapsed. */
function coalesceKey(frame: InboundFrame): string {
  if (CONTROL_TYPES.has(frame.type)) return `ctrl:${++discreteSeq}`;
  const channel = frame.channel ?? TYPE_TO_CHANNEL[frame.type] ?? frame.type;
  if (!COALESCABLE.has(channel)) return `evt:${++discreteSeq}`;
  const pool = resolvePool(frame) ?? '';
  let timeframe = '';
  if (frame.data && typeof frame.data === 'object') {
    const d = frame.data as { timeframe?: unknown };
    if (typeof d.timeframe === 'string') timeframe = d.timeframe;
  }
  return `${channel}:${pool.toLowerCase()}${timeframe ? `:${timeframe}` : ''}`;
}

/**
 * Subscribe to the multiplexed data stream. Returns a handle whose
 * `unsubscribe()` removes the consumer and tears the socket down when the last
 * consumer leaves. SSR-safe (returns a no-op handle without a DOM).
 */
export function subscribe(sub: DataSubscription): DataStreamHandle {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return { unsubscribe: () => {} };
  }
  const id = ++nextConsumerId;
  const consumer: Consumer = {
    id,
    channels: new Set(sub.channels && sub.channels.length ? sub.channels : ALL_CHANNELS),
    pools: normalizePools(sub.pools),
    onEvent: sub.onEvent,
    onStatusChange: sub.onStatusChange,
    onError: sub.onError,
  };
  consumers.set(id, consumer);

  const mgr = ensureManager();
  if (mgr.getStatus() === 'open') {
    syncSubscription(); // socket already open — apply incrementally
  }
  mgr.connect(); // idempotent; opens on first consumer

  // Surface current status to the new consumer immediately.
  consumer.onStatusChange?.(sharedStatus);

  return {
    unsubscribe: () => {
      if (!consumers.delete(id)) return;
      if (consumers.size === 0) {
        manager?.close();
        manager = null;
        appliedChannels = new Set();
        appliedAllPools = false;
        appliedPools = new Set();
        sharedStatus = 'idle';
        return;
      }
      // Other consumers remain — shrink the union if this freed channels/pools.
      if (manager?.getStatus() === 'open') syncSubscription();
    },
  };
}

/** Current shared-socket status (for status indicators). */
export function getDataStreamStatus(): WsStatus {
  return sharedStatus;
}
