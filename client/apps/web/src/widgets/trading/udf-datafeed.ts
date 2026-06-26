import { sdkBaseUrls, getServiceWsUrl } from '@/core/sdk-config';
import { WsManager } from '@/core/realtime/ws-manager';

const API = sdkBaseUrls.candles;
const POLL_INTERVAL = 10_000;

// price_human × 1e9 = mcap_human
// Derived from: mcap_raw = price_wad × 1e15 / 1e18 → mcap_human = price_human × 1e9
const MCAP_MULTIPLIER = 1e9;

export type ChartMode = 'price' | 'mcap';

async function get(path: string, params?: Record<string, string>) {
  const base = typeof window !== 'undefined' ? window.location.origin : undefined;
  const url = new URL(`${API}${path}`, base);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`UDF ${path}: HTTP ${res.status}`);
  return res.json();
}

type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// Maps TradingView resolution strings → candles WS timeframe strings
function resolutionToWsTimeframe(resolution: string): string {
  switch (resolution) {
    case '1': return '1m';
    case '5': return '5m';
    case '15': return '15m';
    case '60': return '1h';
    case '240': return '4h';
    case '1D': case 'D': return '1d';
    case '1W': case 'W': return '1w';
    default: return '1m';
  }
}

function resolutionToSeconds(resolution: string): number {
  const num = parseInt(resolution, 10);
  if (!isNaN(num)) return num * 60;
  switch (resolution) {
    case '1D': case 'D': return 86400;
    case '1W': case 'W': return 604800;
    case '1M': return 2592000;
    default: return 60;
  }
}

function barKey(b: Bar): string {
  return `${b.time}|${b.open}|${b.high}|${b.low}|${b.close}|${b.volume}`;
}

interface CandleWsMessage {
  type: string;
  data?: Record<string, number | string | undefined>;
}

type Subscription = {
  resolution: string;
  onTick: (bar: Bar) => void;
  lastBarKey: string;
  manager: WsManager<CandleWsMessage> | null;
  fallbackTimer: ReturnType<typeof setInterval> | null;
};

function getWsUrl(): string {
  return getServiceWsUrl('candles');
}

export function createUdfDatafeed(poolAddress: string, mode: ChartMode = 'price') {
  const subscriptions = new Map<string, Subscription>();
  const mul = mode === 'mcap' ? MCAP_MULTIPLIER : 1;

  async function fetchLatestBar(resolution: string): Promise<Bar | null> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - resolutionToSeconds(resolution) * 3;
      const data = await get('/history', {
        symbol: poolAddress,
        resolution,
        from: String(from),
        to: String(now + 60),
        countback: '2',
      });
      if (data.s === 'no_data' || !data.t || data.t.length === 0) return null;
      const last = data.t.length - 1;
      return {
        time: Math.round(Number(data.t[last]) * 1000),
        open: Number(data.o[last]) * mul,
        high: Number(data.h[last]) * mul,
        low: Number(data.l[last]) * mul,
        close: Number(data.c[last]) * mul,
        volume: Number(data.v?.[last] ?? 0),
      };
    } catch {
      return null;
    }
  }

  function startFallbackPolling(sub: Subscription, guid: string) {
    if (sub.fallbackTimer) return;
    sub.fallbackTimer = setInterval(async () => {
      const bar = await fetchLatestBar(sub.resolution);
      if (!bar) return;
      const existing = subscriptions.get(guid);
      if (!existing) return;
      const key = barKey(bar);
      if (key === existing.lastBarKey) return;
      existing.lastBarKey = key;
      existing.onTick(bar);
    }, POLL_INTERVAL);
  }

  function stopFallbackPolling(sub: Subscription) {
    if (sub.fallbackTimer) {
      clearInterval(sub.fallbackTimer);
      sub.fallbackTimer = null;
    }
  }

  function connectWs(sub: Subscription, guid: string) {
    const tf = resolutionToWsTimeframe(sub.resolution);
    const manager = new WsManager<CandleWsMessage>({
      url: getWsUrl,
      // The candle server may not reply to ping and is legitimately silent
      // between bar closes, so disable the pong watchdog; dead connections are
      // handled by TCP close -> the manager's backoff reconnect.
      pongTimeoutMs: 0,
      // Backpressure: only the latest candle per timeframe per frame is applied.
      coalesce: { key: () => tf },
      // Snapshot+delta: (re)subscribe on every (re)connect; stop the REST poller
      // while the live stream is healthy.
      onResync: (ctx) => {
        stopFallbackPolling(sub);
        ctx.send({ type: 'subscribe', pools: [poolAddress], timeframes: [tf] });
      },
      onMessage: (msg) => {
        if (msg.type !== 'candle_update') return;
        const d = msg.data;
        if (!d || String(d.poolAddress ?? '').toLowerCase() !== poolAddress.toLowerCase()) return;
        if (d.timeframe !== tf) return;
        // In mcap mode use the pre-computed mcap OHLC fields from CandleBar;
        // fall back to price × multiplier if the server omits them.
        const bar: Bar = mode === 'mcap' ? {
          time: Math.round(Number(d.candleStart) * 1000),
          open: Number(d.mcapOpen ?? (Number(d.open) * MCAP_MULTIPLIER)),
          high: Number(d.mcapHigh ?? (Number(d.high) * MCAP_MULTIPLIER)),
          low: Number(d.mcapLow  ?? (Number(d.low)  * MCAP_MULTIPLIER)),
          close: Number(d.mcapClose ?? (Number(d.close) * MCAP_MULTIPLIER)),
          volume: Number(d.volumeUsdl ?? 0),
        } : {
          time: Math.round(Number(d.candleStart) * 1000),
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
          volume: Number(d.volumeUsdl ?? 0),
        };
        const existing = subscriptions.get(guid);
        if (!existing) return;
        const key = barKey(bar);
        if (key === existing.lastBarKey) return;
        existing.lastBarKey = key;
        existing.onTick(bar);
      },
      onStatusChange: (s) => {
        // Circuit breaker tripped (server unreachable) -> degrade to polling.
        if (s === 'circuit-open' && subscriptions.has(guid)) {
          startFallbackPolling(sub, guid);
        }
      },
    });
    sub.manager = manager;
    manager.connect();
  }

  return {
    onReady: (callback: (config: any) => void) => {
      get('/config').then((cfg) => {
        callback({
          supported_resolutions: cfg.supported_resolutions || ['1', '5', '15', '60', '240', '1D', '1W'],
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: true,
          exchanges: [],
          symbols_types: [],
        });
      });
    },

    searchSymbols: (_input: string, _exchange: string, _type: string, onResult: (r: any[]) => void) => {
      onResult([]);
    },

    resolveSymbol: (_symbolName: string, onResolve: (info: any) => void, onError: (err: string) => void) => {
      get('/symbols', { symbol: poolAddress })
        .then((info) => {
          onResolve({
            name: info.name || poolAddress,
            full_name: info.full_name || poolAddress,
            description: mode === 'mcap' ? `${info.description || ''} (MCap)` : (info.description || ''),
            type: info.type || 'crypto',
            session: info.session || '24x7',
            exchange: info.exchange || 'Sidiora',
            listed_exchange: info.listed_exchange || 'Sidiora',
            timezone: info.timezone || 'Etc/UTC',
            has_intraday: info.has_intraday !== false,
            has_weekly_and_monthly: info.has_weekly_and_monthly || false,
            supported_resolutions: info.supported_resolutions || ['1', '5', '15', '60', '240', '1D', '1W'],
            // mcap values are in the thousands → 2 decimal places; price needs 8
            pricescale: mode === 'mcap' ? 100 : (info.pricescale || 100000000),
            ticker: info.ticker || poolAddress,
            currency_code: info.currency_code || 'USDL',
            has_empty_bars: info.has_empty_bars || false,
            minmov: 1,
            data_status: 'streaming',
          });
        })
        .catch((err) => onError(err.message));
    },

    getBars: (
      _symbolInfo: any,
      resolution: string,
      periodParams: { from: number; to: number; countBack?: number; firstDataRequest?: boolean },
      onResult: (bars: Bar[], meta: { noData?: boolean }) => void,
      onError: (err: string) => void,
    ) => {
      const params: Record<string, string> = {
        symbol: poolAddress,
        resolution,
        from: String(periodParams.from),
        to: String(periodParams.to),
      };
      if (periodParams.countBack !== undefined) {
        params.countback = String(periodParams.countBack);
      }

      get('/history', params)
        .then((data) => {
          if (data.s === 'no_data' || !data.t || data.t.length === 0) {
            onResult([], { noData: true });
            return;
          }

          const bars: Bar[] = data.t.map((t: number, i: number) => ({
            time: t * 1000,
            open: Number(data.o[i]) * mul,
            high: Number(data.h[i]) * mul,
            low: Number(data.l[i]) * mul,
            close: Number(data.c[i]) * mul,
            volume: Number(data.v?.[i] ?? 0),
          }));

          onResult(bars, { noData: false });
        })
        .catch((err) => onError(err.message));
    },

    subscribeBars: (
      _symbolInfo: any,
      resolution: string,
      onTick: (bar: Bar) => void,
      listenerGuid: string,
    ) => {
      const sub: Subscription = {
        resolution,
        onTick,
        lastBarKey: '',
        manager: null,
        fallbackTimer: null,
      };
      subscriptions.set(listenerGuid, sub);
      connectWs(sub, listenerGuid);
    },

    unsubscribeBars: (listenerGuid: string) => {
      const sub = subscriptions.get(listenerGuid);
      if (sub) {
        stopFallbackPolling(sub);
        if (sub.manager) {
          try {
            sub.manager.send({ type: 'unsubscribe', pools: [poolAddress] });
          } catch {}
          sub.manager.close();
        }
        subscriptions.delete(listenerGuid);
      }
    },

    getServerTime: (callback: (time: number) => void) => {
      get('/time').then((t) => callback(typeof t === 'number' ? t : Math.floor(Date.now() / 1000)));
    },
  };
}
