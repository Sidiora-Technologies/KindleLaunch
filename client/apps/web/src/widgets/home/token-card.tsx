'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import TokenImage from '@/ui/shared/token-image';
import MiniSparkline from '@/ui/shared/mini-sparkline';
import QuickBuyButton from '@/ui/shared/quick-buy-button';
import { formatCurrency, formatAddress, from6dec, safeFixed } from '@/utils/format';
import type { TokenMetadata, PoolStats } from './types';

function relativeAge(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function generateSparklineData(stats: PoolStats | null | undefined): number[] {
  if (!stats?.price) return [];
  const price = Number(stats.price);
  if (!price || !isFinite(price)) return [];

  const changes = [
    stats.priceChange24h,
    stats.priceChange1h,
    stats.priceChange15m,
    stats.priceChange5m,
    stats.priceChange1m,
  ].map((c) => (c ? Number(c) / 100 : 0));

  const points: number[] = [];
  let p = price;
  for (let i = 0; i < changes.length; i++) {
    const factor = 1 + changes[i] / 100;
    p = price / (factor || 1);
    points.push(p);
  }
  points.push(price);
  return points;
}

interface TokenCardProps {
  poolAddress: string;
  rank?: number;
  meta?: TokenMetadata | null;
  stats?: PoolStats | null;
  starred?: boolean;
  onToggleStar?: (poolAddress: string) => void;
}

export default function TokenCard({ poolAddress, meta, stats, starred, onToggleStar }: TokenCardProps) {
  const change = stats?.priceChange24h ? Number(stats.priceChange24h) / 100 : 0;
  const change5m = stats?.priceChange5m ? Number(stats.priceChange5m) / 100 : 0;
  const mcap = from6dec(stats?.marketCap);
  const isPositive = change >= 0;
  const age = relativeAge(stats?.createdAt);
  const desc = meta?.description ? (meta.description.length > 70 ? meta.description.slice(0, 67) + '...' : meta.description) : '';
  const logoUrl = meta?.images?.logo;
  const name = meta?.name || formatAddress(poolAddress, 4);
  const symbol = meta?.symbol || '';
  const creator = meta?.creator;
  const momentumWidth = Math.min(Math.abs(change) * 4, 100);

  const sparkData = useMemo(() => generateSparklineData(stats), [stats]);

  const prevPrice = useRef(stats?.price);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (stats?.price && prevPrice.current && stats.price !== prevPrice.current) {
      setPulseKey((k) => k + 1);
    }
    prevPrice.current = stats?.price;
  }, [stats?.price]);

  return (
    <Link
      href={`/token/${poolAddress}`}
      className="group rounded-xl border border-dark-gray bg-black-gray2 hover:border-dark-gray6 transition-all duration-200 overflow-hidden flex flex-col p-3 hover:shadow-lg hover:shadow-black/20"
    >
      {/* Top row: logo + name + star + quick buy */}
      <div className="flex items-center gap-2.5">
        <div className="relative w-10 h-10 rounded-lg bg-dark-gray overflow-hidden flex-shrink-0 border border-dark-gray/70">
          <TokenImage fill src={logoUrl} alt={symbol || name} sizes="40px" className="object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-size-12 font-manrope-bold text-white truncate">{name}</span>
            {symbol && <span className="text-size-9 text-dark-disabled uppercase">{symbol}</span>}
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                <QuickBuyButton poolAddress={poolAddress} tokenSymbol={symbol} />
              </div>
              {onToggleStar && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleStar(poolAddress); }}
                  className={`text-size-12 leading-none flex-shrink-0 transition ${
                    starred ? 'text-yellow-middle' : 'text-dark-disabled hover:text-half-enabled'
                  }`}
                  title={starred ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                  {starred ? '\u2605' : '\u2606'}
                </button>
              )}
            </div>
          </div>
          {creator && (
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-2.5 h-2.5 rounded-full bg-dark-gray6 flex-shrink-0" />
              <span className="text-size-9 text-dark-disabled truncate">{formatAddress(creator, 3)}</span>
              {age && <span className="text-size-9 text-dark-disabled">{age}</span>}
            </div>
          )}
          {!creator && age && (
            <span className="text-size-9 text-dark-disabled mt-0.5 block">{age}</span>
          )}
        </div>
      </div>

      {/* Sparkline + MC + changes */}
      <div className="flex items-center justify-between mt-2.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-baseline gap-1">
            <span className="text-size-9 text-dark-disabled">MC</span>
            <span className="text-size-11 text-white font-manrope-bold">{formatCurrency(mcap)}</span>
          </div>
          {sparkData.length >= 2 && (
            <MiniSparkline data={sparkData} width={48} height={18} positive={isPositive} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {change5m !== 0 && (
            <span className={`text-size-9 font-manrope-bold ${change5m >= 0 ? 'text-green-middle' : 'text-red-middle'}`}>
              {change5m >= 0 ? '+' : ''}{safeFixed(change5m, 1)}%
              <span className="text-dark-disabled font-manrope-medium ml-0.5">5m</span>
            </span>
          )}
          <span className={`text-size-9 font-manrope-bold ${isPositive ? 'text-green-middle' : 'text-red-middle'}`}>
            {isPositive ? '+' : ''}{safeFixed(change, 1)}%
            <span className="text-dark-disabled font-manrope-medium ml-0.5">24h</span>
          </span>
        </div>
      </div>

      {/* Momentum bar */}
      <div className="mt-2">
        <div className="h-[3px] rounded-full bg-dark-gray overflow-hidden">
          <div
            key={pulseKey}
            className={`h-full rounded-full transition-all duration-700 ease-out ${isPositive ? 'bg-green-middle momentum-bar-green' : 'bg-red-middle momentum-bar-red'}`}
            style={{ width: `${momentumWidth}%` }}
          />
        </div>
      </div>

      {/* Description */}
      {desc && (
        <p className="text-size-9 text-dark-disabled mt-1.5 leading-tight line-clamp-2">{desc}</p>
      )}
    </Link>
  );
}
