'use client';

import { useEffect, useState } from 'react';
import { formatCurrency, safeFixed } from '@/utils/format';
import { sdkBaseUrls, getServiceWsUrl } from '@/core/sdk-config';

interface CandleBar {
  poolAddress: string;
  timeframe: string;
  candleStart: number;
  buyVolumeUsdl: number;
  sellVolumeUsdl: number;
  volumeUsdl: number;
  volumeToken: number;
  tradeCount: number;
}

interface PressureData {
  buyPct1h: number;
  sellPct1h: number;
  buyVolume1h: number;
  sellVolume1h: number;
  buyPct24h: number;
  sellPct24h: number;
  buyVolume24h: number;
  sellVolume24h: number;
}

interface CandlePressureProps {
  poolAddress: string;
}

function getWsUrl(): string {
  return getServiceWsUrl('candles');
}

export default function CandlePressure({ poolAddress }: CandlePressureProps) {
  const [candle, setCandle] = useState<CandleBar | null>(null);
  const [pressure, setPressure] = useState<PressureData | null>(null);

  // 3.5: Fetch 1h/24h pressure from backend
  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}/pressure`);
        if (res.ok && !cancelled) {
          setPressure(await res.json());
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [poolAddress]);

  useEffect(() => {
    if (!poolAddress) return;
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        ws = new WebSocket(getWsUrl());

        ws.onopen = () => {
          ws!.send(JSON.stringify({
            type: 'subscribe',
            pools: [poolAddress],
            timeframes: ['1m'],
          }));
          pingTimer = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25_000);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type !== 'candle_update') return;
            const d = msg.data as CandleBar;
            if (!d || d.poolAddress?.toLowerCase() !== poolAddress.toLowerCase()) return;
            if (d.timeframe !== '1m') return;
            setCandle(d);
          } catch {}
        };

        ws.onclose = () => {
          if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
          if (!cancelled) setTimeout(connect, 3_000);
        };

        ws.onerror = () => ws?.close();
      } catch {
        if (!cancelled) setTimeout(connect, 5_000);
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      if (ws) {
        try { ws.send(JSON.stringify({ type: 'unsubscribe', pools: [poolAddress] })); } catch {}
        ws.close();
      }
    };
  }, [poolAddress]);

  if (!candle && !pressure) return null;

  const buyVol = candle?.buyVolumeUsdl ?? 0;
  const sellVol = candle?.sellVolumeUsdl ?? 0;
  const totalVol = buyVol + sellVol;
  const buyPct = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
  const sellPct = 100 - buyPct;
  const dominance = buyPct >= 50 ? 'buy' : 'sell';

  return (
    <div className="rounded-xl border border-dark-gray bg-black-gray2 px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-size-10 text-dark-disabled font-manrope-bold">Buy / Sell Pressure</span>
          <span className="text-size-9 text-dark-disabled/60">live · 1m candle</span>
        </div>
        <div className="flex items-center gap-3 text-size-9 text-dark-disabled">
          <span>{candle?.tradeCount ?? 0} trade{(candle?.tradeCount ?? 0) !== 1 ? 's' : ''}</span>
          <span className={`font-manrope-bold ${dominance === 'buy' ? 'text-green-middle' : 'text-red-middle'}`}>
            {dominance === 'buy' ? 'BUY DOM' : 'SELL DOM'}
          </span>
        </div>
      </div>

      {/* Segmented pressure bar */}
      <div className="h-2.5 rounded-full overflow-hidden flex gap-px bg-dark-gray">
        <div
          className="h-full bg-green-middle rounded-l-full transition-all duration-500"
          style={{ width: `${buyPct}%` }}
        />
        <div
          className="h-full bg-red-middle rounded-r-full transition-all duration-500"
          style={{ width: `${sellPct}%` }}
        />
      </div>

      {/* Volume labels */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-green-middle flex-shrink-0" />
          <span className="text-size-9 text-dark-disabled">Buys</span>
          <span className="text-size-10 font-manrope-bold text-green-middle ml-1">
            {formatCurrency(buyVol)}
          </span>
          <span className="text-size-9 text-dark-disabled">({safeFixed(buyPct, 0)}%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-size-9 text-dark-disabled">({safeFixed(sellPct, 0)}%)</span>
          <span className="text-size-10 font-manrope-bold text-red-middle mr-1">
            {formatCurrency(sellVol)}
          </span>
          <span className="text-size-9 text-dark-disabled">Sells</span>
          <span className="inline-block w-2 h-2 rounded-sm bg-red-middle flex-shrink-0" />
        </div>
      </div>

      {/* 3.5: 1h / 24h aggregate pressure from backend */}
      {pressure && (
        <div className="mt-2 space-y-1.5 pt-2 border-t border-dark-gray/40">
          <PressureRow label="1h" buyPct={pressure.buyPct1h} sellPct={pressure.sellPct1h} buyVol={pressure.buyVolume1h} sellVol={pressure.sellVolume1h} />
          <PressureRow label="24h" buyPct={pressure.buyPct24h} sellPct={pressure.sellPct24h} buyVol={pressure.buyVolume24h} sellVol={pressure.sellVolume24h} />
        </div>
      )}
    </div>
  );
}

function PressureRow({ label, buyPct, sellPct, buyVol, sellVol }: { label: string; buyPct: number; sellPct: number; buyVol: number; sellVol: number }) {
  const bp = buyPct ?? 0;
  const sp = sellPct ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-size-9 text-dark-disabled">{label}</span>
        <div className="flex items-center gap-2 text-size-9">
          <span className="text-green-middle">{formatCurrency(buyVol)} ({safeFixed(bp, 0)}%)</span>
          <span className="text-red-middle">{formatCurrency(sellVol)} ({safeFixed(sp, 0)}%)</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden flex gap-px bg-dark-gray">
        <div className="h-full bg-green-middle/70 rounded-l-full" style={{ width: `${bp}%` }} />
        <div className="h-full bg-red-middle/70 rounded-r-full" style={{ width: `${sp}%` }} />
      </div>
    </div>
  );
}
