import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Real-logic tests for the multiplexed data-stream client.
 *
 * The data-stream + WsManager code under test runs for real; only the WebSocket
 * transport is replaced by an in-memory double the test drives (open/recv/close)
 * and inspects (the frames the client actually sent). The test env is `node`, so
 * we install a minimal `window`/`WebSocket` on globalThis and let the rAF
 * coalescing fall back to setTimeout (driven by fake timers). The module is a
 * singleton, so each test re-imports it fresh via vi.resetModules().
 */

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  url: string;
  sent: Array<Record<string, unknown>> = [];

  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }

  // ── test drivers ──
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  recv(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

let sockets: FakeWebSocket[] = [];

type DataStreamModule = typeof import('./data-stream');

async function loadModule(): Promise<DataStreamModule> {
  vi.resetModules();
  return import('./data-stream');
}

function lastSocket(): FakeWebSocket {
  return sockets[sockets.length - 1];
}

beforeEach(() => {
  sockets = [];
  vi.useFakeTimers();
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { WebSocket?: unknown }).WebSocket;
});

/** Drain the rAF/setTimeout(16) coalescing flush so onEvent callbacks fire. */
function flush(): void {
  vi.advanceTimersByTime(20);
}

describe('data-stream subscription reconciliation', () => {
  it('sends the full union subscribe frame on connect', async () => {
    const { subscribe, DataChannels } = await loadModule();
    const events: unknown[] = [];
    subscribe({ channels: [DataChannels.Swap], pools: ['0xAAA'], onEvent: (e) => events.push(e) });

    const sock = lastSocket();
    expect(sock).toBeDefined();
    sock.open(); // triggers onResync -> subscribe

    expect(sock.sent).toEqual([
      { type: 'subscribe', channels: [DataChannels.Swap], pools: ['0xaaa'] },
    ]);
  });

  it('routes events to a consumer and applies its client-side pool filter', async () => {
    const { subscribe, DataChannels } = await loadModule();
    const got: Array<{ pool?: string; type: string }> = [];
    subscribe({
      channels: [DataChannels.Swap],
      pools: ['0xAAA'],
      onEvent: (e) => got.push({ pool: e.pool, type: e.type }),
    });
    const sock = lastSocket();
    sock.open();

    sock.recv({ type: 'swap', channel: DataChannels.Swap, pool: '0xAAA', data: { amt: 1 } });
    sock.recv({ type: 'swap', channel: DataChannels.Swap, pool: '0xBBB', data: { amt: 2 } });
    flush();

    // Only the matching pool (case-insensitive) is delivered.
    expect(got).toEqual([{ pool: '0xaaa', type: 'swap' }]);
  });

  it('escalates the socket to all-pools when a consumer wants all pools, then restricts again', async () => {
    const { subscribe, DataChannels } = await loadModule();
    const c1: string[] = [];
    const c2: string[] = [];

    subscribe({ channels: [DataChannels.Swap], pools: ['0xAAA'], onEvent: (e) => c1.push(e.pool ?? '') });
    const sock = lastSocket();
    sock.open();
    sock.sent.length = 0; // ignore the initial subscribe

    // Second consumer wants ALL pools -> socket must drop the 0xaaa restriction.
    const h2 = subscribe({ channels: [DataChannels.Swap], onEvent: (e) => c2.push(e.pool ?? '') });
    expect(sock.sent).toEqual([{ type: 'unsubscribe', channels: [], pools: ['0xaaa'] }]);

    // A different pool now reaches c2 (all) but not c1 (0xaaa only).
    sock.recv({ type: 'swap', channel: DataChannels.Swap, pool: '0xBBB', data: {} });
    flush();
    expect(c1).toEqual([]);
    expect(c2).toEqual(['0xbbb']);

    // Removing the all-pools consumer re-restricts the socket to 0xaaa.
    sock.sent.length = 0;
    h2.unsubscribe();
    expect(sock.sent).toEqual([{ type: 'subscribe', channels: [], pools: ['0xaaa'] }]);
  });

  it('derives channel + pool for candle frames (no top-level channel/pool)', async () => {
    const { subscribe, DataChannels } = await loadModule();
    const got: Array<{ channel?: string; pool?: string }> = [];
    subscribe({
      channels: [DataChannels.CandleUpdate],
      pools: ['0xCCC'],
      onEvent: (e) => got.push({ channel: e.channel, pool: e.pool }),
    });
    const sock = lastSocket();
    sock.open();

    sock.recv({ type: 'candle_update', data: { poolAddress: '0xCCC', timeframe: '1m', close: 1 } });
    flush();

    expect(got).toEqual([{ channel: DataChannels.CandleUpdate, pool: '0xccc' }]);
  });

  it('ignores control/keepalive frames', async () => {
    const { subscribe, DataChannels } = await loadModule();
    const got: unknown[] = [];
    subscribe({ channels: [DataChannels.Swap], onEvent: (e) => got.push(e) });
    const sock = lastSocket();
    sock.open();

    sock.recv({ type: 'connected', message: 'hi' });
    sock.recv({ type: 'subscribed', channels: [DataChannels.Swap] });
    sock.recv({ type: 'ping', ts: 123 });
    sock.recv({ type: 'pong' });
    sock.recv({ type: 'error', message: 'x' });
    flush();

    expect(got).toEqual([]);
  });

  it('tears the socket down when the last consumer unsubscribes', async () => {
    const { subscribe, DataChannels } = await loadModule();
    const h = subscribe({ channels: [DataChannels.Swap], onEvent: () => {} });
    const sock = lastSocket();
    sock.open();
    expect(sock.readyState).toBe(FakeWebSocket.OPEN);

    h.unsubscribe();
    expect(sock.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('re-sends the full union after a reconnect (snapshot+delta resync)', async () => {
    const { subscribe, DataChannels } = await loadModule();
    subscribe({ channels: [DataChannels.Swap, DataChannels.MarketCreated], pools: ['0xAAA'], onEvent: () => {} });
    const sock = lastSocket();
    sock.open();
    sock.sent.length = 0;

    // Simulate a reconnect: the same manager opens a new socket and resyncs.
    sock.onclose?.({ code: 1006 }); // abnormal close -> WsManager schedules reconnect
    vi.advanceTimersByTime(2000); // let the backoff timer fire -> new socket
    const sock2 = lastSocket();
    expect(sock2).not.toBe(sock);
    sock2.open();

    expect(sock2.sent).toHaveLength(1);
    const frame = sock2.sent[0] as { type: string; channels: string[]; pools: string[] };
    expect(frame.type).toBe('subscribe');
    expect(new Set(frame.channels)).toEqual(new Set([DataChannels.Swap, DataChannels.MarketCreated]));
    expect(frame.pools).toEqual(['0xaaa']);
  });
});
