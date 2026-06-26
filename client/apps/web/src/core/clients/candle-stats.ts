import { sdkBaseUrls } from '@/core/sdk-config';

export interface CandleStats {
  change24h: number;    // % change over 24h
  change1h: number;     // % change over 1h
  change5m: number;     // % change over 5m
  ath: number;          // all-time high price
  atl: number;          // all-time low price (excluding 0)
}

async function fetchCandles(
  poolAddress: string,
  resolution: string,
  fromTs: number,
  toTs: number,
): Promise<{ t: number[]; o: number[]; h: number[]; l: number[]; c: number[] } | null> {
  try {
    const res = await fetch(
      `${sdkBaseUrls.candles}/history?symbol=${poolAddress}&resolution=${resolution}&from=${fromTs}&to=${toTs}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.s === 'no_data' || !data.t || data.t.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

function pctChange(oldPrice: number, newPrice: number): number {
  if (oldPrice <= 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

export async function fetchCandleStats(poolAddress: string): Promise<CandleStats> {
  const now = Math.floor(Date.now() / 1000);

  const [daily, hourly, fiveMin] = await Promise.all([
    fetchCandles(poolAddress, '1D', now - 365 * 86400, now),
    fetchCandles(poolAddress, '60', now - 2 * 3600, now),
    fetchCandles(poolAddress, '5', now - 600, now),
  ]);

  let ath = 0;
  let atl = 0;
  let change24h = 0;
  let change1h = 0;
  let change5m = 0;

  if (daily && daily.c.length > 0) {
    ath = Math.max(...daily.h);
    const positiveLows = daily.l.filter(v => v > 0);
    if (positiveLows.length > 0) atl = Math.min(...positiveLows);

    const currentClose = daily.c[daily.c.length - 1];
    if (daily.c.length >= 2) {
      change24h = pctChange(daily.o[daily.c.length - 1], currentClose);
    }
    if (daily.c.length >= 2) {
      const prevDayClose = daily.c[daily.c.length - 2];
      change24h = pctChange(prevDayClose, currentClose);
    }
  }

  if (hourly && hourly.c.length >= 2) {
    const currentClose = hourly.c[hourly.c.length - 1];
    const oneHourAgoClose = hourly.c[0];
    change1h = pctChange(oneHourAgoClose, currentClose);
  }

  if (fiveMin && fiveMin.c.length >= 2) {
    const currentClose = fiveMin.c[fiveMin.c.length - 1];
    const fiveMinAgoClose = fiveMin.c[0];
    change5m = pctChange(fiveMinAgoClose, currentClose);
  }

  return { change24h, change1h, change5m, ath, atl };
}
