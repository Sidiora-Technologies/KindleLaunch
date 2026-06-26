'use client';

import { useState, useEffect } from 'react';
import { sdkBaseUrls } from '@/core/sdk-config';
import { reportError } from '@/core/report-error';
import { formatCurrency, formatNumber } from '@/utils/format';

interface PlatformData {
  totalVolume24h: string;
  totalTransactions24h: number;
  uniqueTraders24h: number;
  totalTokensLaunched: number;
  newTokens24h: number;
  totalFees24h: string;
  totalMarketCap: string;
  crossTokenSwaps24h: number;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-dark-disabled text-size-10">{label}</span>
      <span className="text-half-enabled text-size-10 font-manrope-bold">{value}</span>
    </div>
  );
}

export function PlatformMetricsCompact({ expanded }: { expanded: boolean }) {
  const [data, setData] = useState<PlatformData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${sdkBaseUrls.stats}/stats/platform`);
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setData(d);
      } catch (error) {
        reportError(error, { area: 'platform-metrics', action: 'loadCompact' });
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!data) return null;

  const vol = Number(data.totalVolume24h || 0) / 1e6;
  const fees = Number(data.totalFees24h || 0) / 1e10;
  const mcap = Number(data.totalMarketCap || 0) / 1e6;

  if (!expanded) {
    return (
      <div className="px-1.5 pb-3 space-y-2">
        <div className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-dark-gray2/50 border border-dark-gray/50" title="24h Volume">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-green-middle opacity-70">
            <rect x="1" y="8" width="2.5" height="5" rx="0.5" fill="currentColor" />
            <rect x="5.25" y="5" width="2.5" height="8" rx="0.5" fill="currentColor" />
            <rect x="9.5" y="1" width="2.5" height="12" rx="0.5" fill="currentColor" />
          </svg>
          <span className="text-size-8 text-half-enabled font-manrope-bold">{formatCurrency(vol, 0)}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-dark-gray2/50 border border-dark-gray/50" title="Tokens Launched">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-pink-middle opacity-70">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7 4.5V9.5M4.5 7H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="text-size-8 text-half-enabled font-manrope-bold">{data.totalTokensLaunched}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-dark-gray2/50 border border-dark-gray/50" title="24h Traders">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-cyan-middle opacity-70">
            <path d="M9.5 12v-1a2.5 2.5 0 00-2.5-2.5h0A2.5 2.5 0 004.5 11v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="7" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span className="text-size-8 text-half-enabled font-manrope-bold">{formatNumber(data.uniqueTraders24h, 0)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div className="rounded-xl border border-dark-gray/50 bg-dark-gray2/30 p-3 space-y-1.5">
        <div className="text-size-9 text-dark-disabled uppercase tracking-wider mb-2 font-manrope-bold">Platform 24h</div>
        <MetricRow label="Volume" value={formatCurrency(vol)} />
        <MetricRow label="Total MCap" value={formatCurrency(mcap)} />
        <MetricRow label="Fees" value={formatCurrency(fees)} />
        <MetricRow label="Transactions" value={formatNumber(data.totalTransactions24h, 0)} />
        <MetricRow label="Traders" value={formatNumber(data.uniqueTraders24h, 0)} />
        <MetricRow label="Tokens" value={String(data.totalTokensLaunched)} />
        <MetricRow label="New tokens" value={String(data.newTokens24h)} />
        <MetricRow label="Cross-swaps" value={String(data.crossTokenSwaps24h)} />
      </div>
    </div>
  );
}

export function PlatformMetricsMobile() {
  const [data, setData] = useState<PlatformData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${sdkBaseUrls.stats}/stats/platform`);
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setData(d);
      } catch (error) {
        reportError(error, { area: 'platform-metrics', action: 'loadMobile' });
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!data) return null;

  const vol = Number(data.totalVolume24h || 0) / 1e6;
  const mcap = Number(data.totalMarketCap || 0) / 1e6;

  const pills = [
    { label: 'Vol', value: formatCurrency(vol, 0) },
    { label: 'MCap', value: formatCurrency(mcap, 0) },
    { label: 'TXs', value: formatNumber(data.totalTransactions24h, 0) },
    { label: 'Traders', value: formatNumber(data.uniqueTraders24h, 0) },
    { label: 'Tokens', value: String(data.totalTokensLaunched) },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar sm:hidden px-4 py-1.5">
      {pills.map((p) => (
        <div
          key={p.label}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-dark-gray2/60 border border-dark-gray/40 flex-shrink-0"
        >
          <span className="text-size-9 text-dark-disabled">{p.label}</span>
          <span className="text-size-9 text-half-enabled font-manrope-bold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
