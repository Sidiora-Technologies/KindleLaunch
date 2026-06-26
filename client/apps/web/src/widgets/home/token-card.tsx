'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import TokenImage from '@/ui/shared/token-image';
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
  const mcap = from6dec(stats?.marketCap);
  const isPositive = change >= 0;
  const age = relativeAge(stats?.createdAt);
  const desc = meta?.description ? (meta.description.length > 80 ? meta.description.slice(0, 77) + '\u2026' : meta.description) : '';
  const logoUrl = meta?.images?.logo;
  const name = meta?.name || formatAddress(poolAddress, 4);
  const symbol = meta?.symbol || '';
  const creator = meta?.creator;
  const holders = stats?.holderCount;

  // Subtle background-tone flash on price change (no glow / no border).
  const prevPrice = useRef(stats?.price);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const prev = prevPrice.current;
    if (stats?.price && prev && stats.price !== prev) {
      setFlash(Number(stats.price) >= Number(prev) ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 650);
      prevPrice.current = stats.price;
      return () => clearTimeout(t);
    }
    prevPrice.current = stats?.price;
  }, [stats?.price]);

  return (
    <Link
      href={`/token/${poolAddress}`}
      className="group relative rounded-xl bg-black-gray2 hover:bg-dark-gray7 transition-colors duration-200 overflow-hidden flex flex-col"
    >
      {/* Square cover art */}
      <div className="relative aspect-square bg-dark-gray overflow-hidden">
        <TokenImage
          fill
          src={logoUrl}
          alt={symbol || name}
          sizes="(min-width:1280px) 16vw, (min-width:768px) 25vw, 50vw"
          className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
        />
        {onToggleStar && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleStar(poolAddress); }}
            className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-size-12 leading-none transition ${
              starred ? 'text-yellow-middle' : 'text-half-enabled/70 hover:text-white'
            }`}
            title={starred ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {starred ? '\u2605' : '\u2606'}
          </button>
        )}
        <div className="absolute bottom-1.5 right-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
          <QuickBuyButton poolAddress={poolAddress} tokenSymbol={symbol} />
        </div>
        {flash && (
          <span
            className={`pointer-events-none absolute inset-0 ${flash === 'up' ? 'bg-green-opacity-015' : 'bg-red-opacity-015'}`}
          />
        )}
      </div>

      {/* Info block */}
      <div className="p-2.5 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-size-12 font-manrope-bold text-white truncate">{name}</span>
          {symbol && <span className="text-size-9 text-dark-disabled uppercase flex-shrink-0">{symbol}</span>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1 min-w-0">
            <span className="text-size-9 text-dark-disabled">MC</span>
            <span className="text-size-11 font-manrope-bold text-green-middle truncate tabular-nums">{formatCurrency(mcap)}</span>
          </div>
          <span className={`text-size-10 font-manrope-bold tabular-nums flex-shrink-0 ${isPositive ? 'text-green-middle' : 'text-red-middle'}`}>
            {isPositive ? '+' : ''}{safeFixed(change, 1)}%
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-size-9 text-dark-disabled min-w-0">
          {creator && (
            <span className="flex items-center gap-1 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-dark-gray6 flex-shrink-0" />
              <span className="truncate">{formatAddress(creator, 3)}</span>
            </span>
          )}
          {typeof holders === 'number' && holders > 0 && (
            <span className="flex-shrink-0">{holders} holders</span>
          )}
          {age && <span className="ml-auto flex-shrink-0">{age}</span>}
        </div>

        {desc && (
          <p className="text-size-9 text-dark-disabled leading-tight line-clamp-2 mt-0.5">{desc}</p>
        )}
      </div>
    </Link>
  );
}
