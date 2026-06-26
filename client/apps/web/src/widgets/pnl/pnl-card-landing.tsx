'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ca,
  computeMultiple,
  computeTotalPnlUsdl,
  logEvent,
  pnlBigintToUsd,
  tokenToNum,
  usdlToNum,
  wadToNum,
  type MintedCard,
  type UserPosition,
} from '@/core/clients/pnl';
import {
  isAddressAlreadyBound,
  markAddressBound,
  rememberReferral,
} from '@/core/clients/pnl-referral';
import { formatAddress, formatCurrency, formatNumber, safeFixed } from '@/utils/format';
import { useAccount } from 'wagmi';

interface PnlCardLandingProps {
  card: MintedCard;
  livePosition: UserPosition | null;
}

export default function PnlCardLanding({ card, livePosition }: PnlCardLandingProps) {
  const { snapshot, shortCode, cardId } = card;
  const { address: viewerAddress } = useAccount();

  // Seed the client-side referral mirror so global PnlAttribution can fire
  // wallet_bind on future wallet connects (e.g. viewer comes back tomorrow).
  useEffect(() => {
    rememberReferral(shortCode, cardId);
  }, [shortCode, cardId]);

  // Fire wallet_bind when a viewer connects their wallet on this page.
  // Self-referral is dropped server-side so we call unconditionally —
  // but dedupe locally to avoid repeated posts on re-renders.
  useEffect(() => {
    if (!viewerAddress) return;
    if (isAddressAlreadyBound(viewerAddress)) return;
    logEvent({
      type: 'wallet_bind',
      walletAddress: viewerAddress,
      cardId,
      shortCode,
    }).then(() => markAddressBound(viewerAddress));
  }, [viewerAddress, cardId, shortCode]);

  // Reuse the frozen position for headline numbers; the live position (if any)
  // drives the separate "Live position" strip further down.
  const pos = snapshot.position;
  const priceWad = snapshot.market.priceWad;

  const multiple = computeMultiple(pos, priceWad);
  const pnlRaw = computeTotalPnlUsdl(pos, priceWad);
  const pnlUsd = pnlBigintToUsd(pnlRaw);
  const isPositive = pnlRaw >= 0n;

  const spent = usdlToNum(pos.totalUsdlSpent);
  const received = usdlToNum(pos.totalUsdlReceived);
  const realizedPnl = usdlToNum(pos.realizedPnlUsdl);
  const marketCap = usdlToNum(snapshot.market.marketCapUsdl);
  const price = wadToNum(priceWad);

  const held = tokenToNum(pos.currentHoldings);
  const holdDays = pos.firstBuyTs
    ? Math.max(1, Math.floor((pos.lastTradeTs - pos.firstBuyTs) / 86400))
    : null;

  const symbol = snapshot.tokenSymbol || 'Token';
  const name = snapshot.tokenName || symbol;
  // PNL snapshot stores addresses lowercase; token market page wants EIP-55 checksum.
  const tradeHref = `/token/${ca(snapshot.poolAddress)}`;

  const handleTradeClick = useCallback(() => {
    // fire-and-forget — don't block navigation on this
    logEvent({ type: 'click', cardId, shortCode });
  }, [cardId, shortCode]);

  // Live vs frozen delta — if position has changed since mint
  const livePnl = livePosition
    ? pnlBigintToUsd(computeTotalPnlUsdl(livePosition, priceWad))
    : null;
  const liveMultiple = livePosition ? computeMultiple(livePosition, priceWad) : null;

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-start justify-center py-8 px-4">
      <div className="w-full max-w-[640px] space-y-5">
        {/* Header chip */}
        <div className="flex items-center justify-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark-gray4 border border-dark-gray7">
            <span className="w-1.5 h-1.5 rounded-full bg-green-middle animate-pulse" />
            <span className="text-size-11 text-dark-gray9 font-manrope-bold uppercase tracking-wider">
              Sidiora PNL
            </span>
          </div>
        </div>

        {/* Hero card */}
        <div className="border border-dark-gray7 rounded-2xl bg-dark-gray4 overflow-hidden shadow-2xl">
          {/* OG image preview */}
          <div className="relative aspect-[1200/630] bg-dark-gray2 border-b border-dark-gray7 overflow-hidden">
            { }
            <img
              src={card.ogUrl}
              alt={`${symbol} PNL card`}
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
            />
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-px bg-dark-gray7 border-b border-dark-gray7">
            <Stat
              label="Multiple"
              value={`${safeFixed(multiple, 2)}x`}
              positive={multiple >= 1}
            />
            <Stat
              label="Total PNL"
              value={formatSignedUsd(pnlUsd)}
              positive={isPositive}
            />
            <Stat
              label="Market cap"
              value={marketCap > 0 ? formatCurrency(marketCap, 1) : '—'}
              positive={null}
            />
          </div>

          {/* CTA */}
          <div className="p-5 space-y-4">
            <Link
              href={tradeHref}
              onClick={handleTradeClick}
              className="block w-full text-center py-3.5 rounded-xl text-size-14 font-manrope-extra-bold bg-green-middle text-black hover:bg-green-middle2 transition"
            >
              Trade ${symbol} on Sidiora
            </Link>

            <div className="flex items-center justify-between text-size-11 text-dark-disabled">
              <span>Held by {formatAddress(snapshot.ownerAddress)}</span>
              <span>{pos.tradeCount} {pos.tradeCount === 1 ? 'trade' : 'trades'}</span>
            </div>
          </div>
        </div>

        {/* Position details */}
        <div className="border border-dark-gray7 rounded-2xl bg-dark-gray4 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-gray7">
            <h2 className="text-size-13 font-manrope-bold text-white">Position breakdown</h2>
          </div>
          <div className="grid grid-cols-2 gap-px bg-dark-gray7">
            <Row label="Total spent" value={formatCurrency(spent)} />
            <Row label="Total received" value={formatCurrency(received)} />
            <Row label="Realized PNL" value={formatSignedUsd(realizedPnl)} positive={realizedPnl >= 0} />
            <Row label="Avg cost basis" value={formatPriceCompact(wadToNum(pos.avgCostBasis))} />
            <Row label="Current holdings" value={`${formatNumber(held, 2)} ${symbol}`} />
            <Row label="Current price" value={formatPriceCompact(price)} />
            {holdDays !== null && <Row label="Hold duration" value={`${holdDays}d`} />}
            <Row label="First buy" value={pos.firstBuyTs ? relativeTime(pos.firstBuyTs) : '—'} />
          </div>
        </div>

        {/* Live ticker — only if position drifted since mint */}
        {livePosition && livePnl !== null && liveMultiple !== null && (
          <div className="border border-dark-gray7 rounded-2xl bg-dark-gray4 px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-size-12 font-manrope-bold text-white">Live position</h3>
              <span className="text-size-9 text-dark-disabled uppercase tracking-wider">
                Updated now
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-size-10 text-dark-disabled uppercase tracking-wider">
                  Multiple
                </div>
                <div className={`text-size-16 font-manrope-extra-bold ${liveMultiple >= 1 ? 'text-green-middle' : 'text-red-middle'}`}>
                  {safeFixed(liveMultiple, 2)}x
                </div>
              </div>
              <div>
                <div className="text-size-10 text-dark-disabled uppercase tracking-wider">
                  Total PNL
                </div>
                <div className={`text-size-16 font-manrope-extra-bold ${livePnl >= 0 ? 'text-green-middle' : 'text-red-middle'}`}>
                  {formatSignedUsd(livePnl)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer — attribution info */}
        <p className="text-size-10 text-dark-disabled text-center pt-2">
          Card minted {relativeTime(snapshot.capturedAt)} · Referral code{' '}
          <span className="font-mono text-half-enabled">{shortCode}</span>
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean | null;
}) {
  const color =
    positive === null
      ? 'text-white'
      : positive
        ? 'text-green-middle'
        : 'text-red-middle';
  return (
    <div className="bg-dark-gray4 px-4 py-4 text-center">
      <div className="text-size-9 text-dark-disabled uppercase tracking-wider mb-1.5">
        {label}
      </div>
      <div className={`text-size-16 font-manrope-extra-bold ${color}`}>{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const color =
    positive === undefined
      ? 'text-half-enabled'
      : positive
        ? 'text-green-middle'
        : 'text-red-middle';
  return (
    <div className="bg-dark-gray4 px-5 py-3 flex items-center justify-between">
      <span className="text-size-11 text-dark-disabled">{label}</span>
      <span className={`text-size-12 font-manrope-bold tabular-nums ${color}`}>{value}</span>
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

function relativeTime(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
