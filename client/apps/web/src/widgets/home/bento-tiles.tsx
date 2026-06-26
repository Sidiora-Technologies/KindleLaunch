'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import TokenImage from '@/ui/shared/token-image';
import { formatCurrency, from6dec, formatAddress, safeFixed } from '@/utils/format';
import { AppleBorderGradient } from '@/new-components/AppleBorderGradient';
import type { EnrichedToken } from './use-bento-hero';

// ── HeroTile (featured #1, 2×2) ──────────────────────────────────────────────

export function HeroTile({ token }: { token: EnrichedToken | null }) {
  if (!token) {
    return <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[280px]" />;
  }

  const { poolAddress, meta, stats } = token;
  const name = meta?.name || meta?.symbol || formatAddress(poolAddress, 4);
  const symbol = meta?.symbol || '';
  const desc = meta?.description || '';
  const logo = meta?.images?.logo;
  const banner = meta?.images?.banner;
  const mcap = from6dec(stats?.marketCap);
  const vol24h = from6dec(stats?.volume24h);
  const change24h = stats?.priceChange24h ? Number(stats.priceChange24h) / 100 : 0;
  const isPositive = change24h >= 0;

  return (
    <Link
      href={`/token/${poolAddress}`}
      className="group relative overflow-hidden rounded-2xl border border-dark-gray bg-dark-gray4/40 hover:border-dark-gray6 transition-colors flex flex-col min-h-[280px] md:min-h-0"
      style={{ gridArea: 'hero' }}
    >
      <AppleBorderGradient
        preview={false}
        intensity="lg"
        className="rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      />
      <div className="absolute inset-0">
        {banner || logo ? (
          <TokenImage
            fill
            src={banner || logo}
            alt={symbol || name}
            sizes="(min-width: 1024px) 600px, 100vw"
            priority
            className="object-cover opacity-40 group-hover:opacity-50 transition-opacity"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-tr from-dark-gray4 via-dark-gray4/85 to-dark-gray4/40" />
      </div>

      <div className="relative z-10 flex items-start justify-between p-5">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-middle/15 border border-green-middle/25 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-green-middle animate-pulse" />
          <span className="text-size-10 font-manrope-bold text-green-middle uppercase tracking-wider">Spotlight</span>
        </div>
        <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border backdrop-blur-sm ${
          isPositive ? 'bg-green-opacity-015 border-green-middle/30 text-green-middle' : 'bg-red-opacity-015 border-red-middle/30 text-red-middle'
        }`}>
          <span className="text-size-11 font-manrope-bold">
            {isPositive ? '+' : ''}{safeFixed(change24h, 2)}%
          </span>
          <span className="text-size-9 opacity-60">24h</span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="relative z-10 p-5 pt-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-14 h-14 rounded-xl bg-dark-gray border border-dark-gray6/50 overflow-hidden flex-shrink-0">
            {logo ? (
              <TokenImage fill src={logo} alt={symbol || name} sizes="56px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-half-enabled font-manrope-bold text-size-15">
                {(symbol || name).slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-[22px] font-manrope-extra-bold text-white truncate leading-tight">{name}</span>
              {symbol && name !== symbol && (
                <span className="text-size-12 text-dark-disabled uppercase font-manrope-bold">{symbol}</span>
              )}
            </div>
            {desc && (
              <p className="text-size-11 text-half-enabled/80 mt-0.5 line-clamp-1">{desc}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-dark-gray/60">
          <div>
            <div className="text-size-9 text-dark-disabled uppercase tracking-wider mb-0.5">Market Cap</div>
            <div className="text-size-14 text-white font-manrope-bold tabular-nums">{formatCurrency(mcap, 2)}</div>
          </div>
          <div>
            <div className="text-size-9 text-dark-disabled uppercase tracking-wider mb-0.5">Volume 24h</div>
            <div className="text-size-14 text-white font-manrope-bold tabular-nums">{formatCurrency(vol24h, 2)}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── SpotlightTile (small, top gainer / newest) ───────────────────────────────

interface SpotlightTileProps {
  token: EnrichedToken | null;
  label: string;
  labelColor: 'pink' | 'cyan';
  gridArea: string;
  metricLabel: string;
  metricValue: string;
  metricTone: 'green' | 'red' | 'neutral';
}

export function SpotlightTile({ token, label, labelColor, gridArea, metricLabel, metricValue, metricTone }: SpotlightTileProps) {
  if (!token) {
    return <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[120px]" style={{ gridArea }} />;
  }

  const { poolAddress, meta } = token;
  const name = meta?.name || meta?.symbol || formatAddress(poolAddress, 4);
  const symbol = meta?.symbol || '';
  const logo = meta?.images?.logo;

  const labelBg = labelColor === 'pink'
    ? 'bg-pink-middle/15 text-pink-middle border-pink-middle/25'
    : 'bg-cyan-middle/15 text-cyan-middle border-cyan-middle/25';
  const metricClr = metricTone === 'green' ? 'text-green-middle' : metricTone === 'red' ? 'text-red-middle' : 'text-half-enabled';

  return (
    <Link
      href={`/token/${poolAddress}`}
      className="group rounded-2xl border border-dark-gray bg-dark-gray4/40 hover:border-dark-gray6 transition-colors p-4 flex flex-col justify-between min-h-[120px] md:min-h-0"
      style={{ gridArea }}
    >
      <div className={`inline-flex items-center self-start px-2 py-0.5 rounded-full border ${labelBg}`}>
        <span className="text-size-9 font-manrope-bold uppercase tracking-wider">{label}</span>
      </div>

      <div className="flex items-center gap-2.5 mt-3">
        <div className="relative w-9 h-9 rounded-lg bg-dark-gray border border-dark-gray6/50 overflow-hidden flex-shrink-0">
          {logo ? (
            <TokenImage fill src={logo} alt={symbol || name} sizes="36px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-half-enabled font-manrope-bold text-size-10">
              {(symbol || name).slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-size-12 font-manrope-bold text-white truncate leading-tight">{name}</div>
          {symbol && name !== symbol && (
            <div className="text-size-9 text-dark-disabled uppercase">{symbol}</div>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-dark-gray/50">
        <span className="text-size-9 text-dark-disabled uppercase tracking-wider">{metricLabel}</span>
        <span className={`text-size-13 font-manrope-bold tabular-nums ${metricClr}`}>{metricValue}</span>
      </div>
    </Link>
  );
}

// ── FeedTile (live trending list) ────────────────────────────────────────────

export function FeedTile({ tokens }: { tokens: EnrichedToken[] }) {
  if (tokens.length === 0) {
    return <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[280px]" style={{ gridArea: 'feed' }} />;
  }

  return (
    <div
      className="rounded-2xl border border-dark-gray bg-dark-gray4/40 p-4 flex flex-col min-h-[280px] md:min-h-0"
      style={{ gridArea: 'feed' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-middle animate-pulse" />
          <h3 className="text-size-12 font-manrope-extra-bold text-white uppercase tracking-wider">Live Trending</h3>
        </div>
        <span className="text-size-10 text-dark-disabled">Top {tokens.length}</span>
      </div>

      <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
        {tokens.map((t, i) => {
          const name = t.meta?.name || t.meta?.symbol || formatAddress(t.poolAddress, 4);
          const symbol = t.meta?.symbol || '';
          const logo = t.meta?.images?.logo;
          const change = t.stats?.priceChange24h ? Number(t.stats.priceChange24h) / 100 : 0;
          const mcap = from6dec(t.stats?.marketCap);
          const isPositive = change >= 0;

          return (
            <Link
              key={t.poolAddress}
              href={`/token/${t.poolAddress}`}
              className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-dark-gray/50 transition-colors"
            >
              <span className="text-size-11 text-dark-disabled font-manrope-bold w-4 text-center tabular-nums">
                {i + 1}
              </span>
              <div className="relative w-7 h-7 rounded-md bg-dark-gray border border-dark-gray6/40 overflow-hidden flex-shrink-0">
                {logo ? (
                  <TokenImage fill src={logo} alt={symbol || name} sizes="28px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-half-enabled font-manrope-bold text-size-9">
                    {(symbol || name).slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-size-11 font-manrope-bold text-white truncate leading-tight group-hover:text-white">
                  {symbol || name}
                </div>
                <div className="text-size-9 text-dark-disabled tabular-nums">{formatCurrency(mcap, 1)}</div>
              </div>
              <span className={`text-size-10 font-manrope-bold tabular-nums ${isPositive ? 'text-green-middle' : 'text-red-middle'}`}>
                {isPositive ? '+' : ''}{safeFixed(change, 1)}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── StatTile (platform stat) ─────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: string;
  sublabel?: string;
  gridArea: string;
  accent: 'green' | 'pink' | 'yellow' | 'cyan';
  icon: ReactNode;
}

export function StatTile({ label, value, sublabel, gridArea, accent, icon }: StatTileProps) {
  const accentMap = {
    green: 'text-green-middle',
    pink: 'text-pink-middle',
    yellow: 'text-yellow-middle',
    cyan: 'text-cyan-middle',
  };

  return (
    <div
      className="rounded-2xl border border-dark-gray bg-dark-gray4/40 p-4 flex flex-col justify-between min-h-[110px] md:min-h-0"
      style={{ gridArea }}
    >
      <div className="flex items-center justify-between">
        <span className="text-size-10 text-dark-disabled uppercase tracking-wider font-manrope-bold">{label}</span>
        <div className={`w-7 h-7 rounded-lg bg-dark-gray/60 flex items-center justify-center ${accentMap[accent]}`}>
          {icon}
        </div>
      </div>
      <div>
        <div className="text-[24px] font-manrope-extra-bold text-white tabular-nums leading-tight">{value}</div>
        {sublabel && (
          <div className="text-size-10 text-dark-disabled mt-0.5 tabular-nums">{sublabel}</div>
        )}
      </div>
    </div>
  );
}
