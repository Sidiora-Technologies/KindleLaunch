'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ca,
  computeMultiple,
  computeTotalPnlUsdl,
  getPortfolio,
  pnlBigintToUsd,
  tokenToNum,
  usdlToNum,
  type PortfolioPosition,
} from '@/core/clients/pnl';
import { formatAddress, formatCurrency, formatNumber, safeFixed } from '@/utils/format';
import ShareCardButton from '@/widgets/pnl/share-pnl-button';

/**
 * 3.4: Uses backend GET /users/:addr/portfolio instead of N+1 client-side
 * fetches (positions + per-position stats + per-position metadata).
 */

interface PositionsTabProps {
  walletAddress: string;
  canShare: boolean;
}

export default function PositionsTab({ walletAddress, canShare }: PositionsTabProps) {
  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const portfolio = await getPortfolio(walletAddress);
        if (cancelled) return;

        const sorted = [...portfolio.positions].sort((a, b) => {
          const pa = computeTotalPnlUsdl(a, a.priceWad);
          const pb = computeTotalPnlUsdl(b, b.priceWad);
          return pb > pa ? 1 : pb < pa ? -1 : 0;
        });

        setPositions(sorted);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Failed to load positions';
          setError(msg);
          setPositions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (loading) {
    return (
      <div className="py-8 text-center text-dark-disabled text-size-12 animate-pulse">
        Loading positions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-middle text-size-12">
        {error}
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="py-8 text-center text-dark-disabled text-size-12">
        No positions yet — buy a token to open one.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {positions.map((p) => (
        <PositionRow
          key={p.poolAddress}
          position={p}
          walletAddress={walletAddress}
          canShare={canShare}
        />
      ))}
    </div>
  );
}

function PositionRow({
  position,
  walletAddress,
  canShare,
}: {
  position: PortfolioPosition;
  walletAddress: string;
  canShare: boolean;
}) {
  const multiple = useMemo(
    () => computeMultiple(position, position.priceWad),
    [position],
  );
  const pnlRaw = useMemo(
    () => computeTotalPnlUsdl(position, position.priceWad),
    [position],
  );
  const pnlUsd = pnlBigintToUsd(pnlRaw);
  const isPositive = pnlRaw >= 0n;
  const isClosed = position.currentHoldings === '0' || position.currentHoldings === '';

  const holdings = tokenToNum(position.currentHoldings);
  const realizedPnl = usdlToNum(position.realizedPnlUsdl);
  const spent = usdlToNum(position.totalUsdlSpent);

  // The PNL API returns lowercase addresses; the token market page matches on
  // the EIP-55 checksummed form that other surfaces (stats / ranking) emit.
  const poolHref = `/token/${ca(position.poolAddress)}`;

  return (
    <div className="border border-dark-gray7 rounded-xl bg-dark-gray4 overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-gray7">
        <Link
          href={poolHref}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition"
        >
          <TokenAvatar logo={position.tokenLogo} symbol={position.tokenSymbol} />
          <div className="min-w-0">
            <div className="text-size-13 font-manrope-bold text-white truncate">
              {position.tokenName || formatAddress(position.poolAddress, 4)}
            </div>
            <div className="text-size-11 text-dark-disabled truncate">
              {position.tokenSymbol ? `$${position.tokenSymbol} · ` : ''}{position.tradeCount}{' '}
              {position.tradeCount === 1 ? 'trade' : 'trades'}
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isClosed ? (
            <span className="text-size-10 text-dark-disabled px-2 py-1 rounded-md bg-dark-gray2 border border-dark-gray7 uppercase tracking-wider">
              Closed
            </span>
          ) : (
            <span className="text-size-10 text-green-middle px-2 py-1 rounded-md bg-green-middle/10 border border-green-middle/20 uppercase tracking-wider">
              Holding
            </span>
          )}

          {canShare && (
            <ShareCardButton
              variant="compact"
              poolAddress={position.poolAddress}
              ownerAddress={walletAddress}
              tokenSymbol={position.tokenSymbol}
              label="Share"
            />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-px bg-dark-gray7">
        <MetricCell
          label="Multiple"
          value={`${safeFixed(multiple, 2)}x`}
          tone={multiple >= 1 ? 'positive' : 'negative'}
        />
        <MetricCell
          label="Total PNL"
          value={formatSignedUsd(pnlUsd)}
          tone={isPositive ? 'positive' : 'negative'}
        />
        <MetricCell
          label="Realized"
          value={formatSignedUsd(realizedPnl)}
          tone={realizedPnl >= 0 ? 'positive' : 'negative'}
        />
        <MetricCell
          label="Spent"
          value={formatCurrency(spent)}
          tone="neutral"
        />
      </div>

      {/* Subtle footer with holdings + cost basis */}
      {!isClosed && (
        <div className="px-4 py-2 flex items-center justify-between text-size-11 text-dark-disabled">
          <span>
            Holding{' '}
            <span className="text-half-enabled font-manrope-bold">
              {formatNumber(holdings, 2)}{position.tokenSymbol ? ` $${position.tokenSymbol}` : ''}
            </span>
          </span>
          <span>
            Avg cost{' '}
            <span className="text-half-enabled font-manrope-bold">
              {formatPriceCompact(wadToNumber(position.avgCostBasis))}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const color =
    tone === 'positive'
      ? 'text-green-middle'
      : tone === 'negative'
        ? 'text-red-middle'
        : 'text-half-enabled';
  return (
    <div className="bg-dark-gray4 px-3 py-2.5">
      <div className="text-size-9 text-dark-disabled uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className={`text-size-13 font-manrope-bold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function TokenAvatar({ logo, symbol }: { logo: string | null; symbol: string }) {
  if (logo) {
    return (
       
      <img
        src={logo}
        alt={symbol || '?'}
        className="w-9 h-9 rounded-full bg-dark-gray2 border border-dark-gray7 object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-dark-gray2 border border-dark-gray7 flex items-center justify-center flex-shrink-0">
      <span className="text-size-10 text-dark-disabled font-manrope-bold">
        {(symbol || '?').slice(0, 3).toUpperCase()}
      </span>
    </div>
  );
}

function formatSignedUsd(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${safeFixed(abs / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${sign}$${safeFixed(abs / 1_000, 2)}K`;
  if (abs >= 1) return `${sign}$${safeFixed(abs, 2)}`;
  return `${sign}$${safeFixed(abs, 4)}`;
}

function formatPriceCompact(n: number): string {
  if (n === 0) return '—';
  if (n >= 1) return `$${safeFixed(n, 2)}`;
  if (n >= 0.01) return `$${safeFixed(n, 4)}`;
  return `$${safeFixed(n, 8)}`;
}

// Inline WAD conversion so we don't pull in all of format.ts for one function
function wadToNumber(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    return Number(BigInt(raw)) / 1e18;
  } catch {
    return 0;
  }
}

