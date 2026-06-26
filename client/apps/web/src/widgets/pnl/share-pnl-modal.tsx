'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { safeFixed } from '@/utils/format';
import type { MintedCard } from '@/core/clients/pnl';
import {
  computeMultiple,
  computeTotalPnlUsdl,
  pnlBigintToUsd,
  usdlToNum,
} from '@/core/clients/pnl';

interface SharePnlModalProps {
  card: MintedCard;
  tokenSymbol?: string | null;
  onClose: () => void;
}

export default function SharePnlModal({ card, tokenSymbol, onClose }: SharePnlModalProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const symbol = tokenSymbol ?? card.snapshot.tokenSymbol ?? 'token';
  const multiple = computeMultiple(card.snapshot.position, card.snapshot.market.priceWad);
  const pnlRaw = computeTotalPnlUsdl(card.snapshot.position, card.snapshot.market.priceWad);
  const pnlUsd = pnlBigintToUsd(pnlRaw);
  const isPositive = pnlRaw >= 0n;

  const shareText = buildShareText(symbol, multiple, pnlUsd, isPositive);
  const xHref = buildXIntent(shareText, card.shareUrl);
  const tgHref = buildTelegramIntent(shareText, card.shareUrl);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(card.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — fall back to selecting text
    }
  }, [card.shareUrl]);

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  const imgRef = useRef<HTMLImageElement>(null);

  const handleDownloadImage = useCallback(async () => {
    try {
      const res = await fetch(card.ogUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${symbol}-pnl-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open image in new tab
      window.open(card.ogUrl, '_blank');
    }
  }, [card.ogUrl, symbol]);

  const handleShareImage = useCallback(async () => {
    try {
      const res = await fetch(card.ogUrl);
      const blob = await res.blob();
      const file = new File([blob], `${symbol}-pnl.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `My ${symbol} trade on Sidiora`,
          text: shareText,
          files: [file],
        });
        return;
      }
    } catch {}
    // Fallback to URL share
    try {
      await navigator.share({
        title: `My ${symbol} trade on Sidiora`,
        text: shareText,
        url: card.shareUrl,
      });
    } catch {}
  }, [card.ogUrl, card.shareUrl, shareText, symbol]);

  return (
    <div
      className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 transition-opacity duration-200 ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-[440px] bg-dark-gray4 border border-dark-gray7 rounded-2xl shadow-2xl overflow-hidden transition-transform duration-200 ${
          mounted ? 'scale-100' : 'scale-95'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-gray7">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center ${
                isPositive ? 'bg-green-middle/20' : 'bg-red-middle/20'
              }`}
            >
              <TrophyIcon
                className={`w-3.5 h-3.5 ${isPositive ? 'text-green-middle' : 'text-red-middle'}`}
              />
            </div>
            <span className="text-size-13 font-manrope-bold text-white">
              Your {symbol} card is live
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-dark-disabled hover:text-half-enabled transition p-1"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* OG preview */}
        <div className="relative aspect-[1200/630] bg-dark-gray2 border-b border-dark-gray7 overflow-hidden">
          <img
            ref={imgRef}
            src={card.ogUrl}
            alt={`${symbol} PNL card`}
            className="absolute inset-0 w-full h-full object-cover"
            crossOrigin="anonymous"
            loading="eager"
          />
        </div>

        {/* Highlight row */}
        <div className="grid grid-cols-3 gap-px bg-dark-gray7 border-b border-dark-gray7">
          <Stat label="Multiple" value={`${safeFixed(multiple, 2)}x`} positive={multiple >= 1} />
          <Stat
            label="Total PNL"
            value={formatUsd(pnlUsd)}
            positive={isPositive}
          />
          <Stat
            label="Realized"
            value={formatUsd(usdlToNum(card.snapshot.position.realizedPnlUsdl))}
            positive={usdlToNum(card.snapshot.position.realizedPnlUsdl) >= 0}
          />
        </div>

        {/* Share actions */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <ShareAction
              href={xHref}
              label="Share on X"
              icon={<XIcon className="w-4 h-4" />}
              bg="bg-white text-black hover:bg-white/90"
            />
            <ShareAction
              href={tgHref}
              label="Telegram"
              icon={<TelegramIcon className="w-4 h-4" />}
              bg="bg-[#229ED9] text-white hover:bg-[#1e8bc0]"
            />
          </div>

          <div className="flex items-stretch gap-2">
            <div className="flex-1 flex items-center gap-2 bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-2 min-w-0">
              <LinkIcon className="w-3.5 h-3.5 text-dark-disabled flex-shrink-0" />
              <span className="text-size-11 text-half-enabled font-mono truncate">
                {displayShareUrl(card.shareUrl)}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className={`px-3 py-2 rounded-lg text-size-11 font-manrope-bold transition border ${
                copied
                  ? 'bg-green-middle/15 text-green-middle border-green-middle/40'
                  : 'bg-dark-gray2 text-half-enabled border-dark-gray hover:border-half-enabled'
              }`}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadImage}
              className="flex-1 py-2 rounded-lg text-size-11 font-manrope-bold bg-dark-gray2 text-half-enabled border border-dark-gray hover:border-half-enabled transition inline-flex items-center justify-center gap-1.5"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Save Image
            </button>
            {hasNativeShare && (
              <button
                onClick={handleShareImage}
                className="flex-1 py-2 rounded-lg text-size-11 font-manrope-bold bg-dark-gray2 text-half-enabled border border-dark-gray hover:border-half-enabled transition inline-flex items-center justify-center gap-1.5"
              >
                <ShareOutIcon className="w-3.5 h-3.5" />
                Share Image
              </button>
            )}
          </div>

          <a
            href={card.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-2 rounded-lg text-size-11 font-manrope-bold bg-dark-gray2 text-half-enabled border border-dark-gray hover:border-half-enabled transition text-center"
          >
            Open card page
          </a>

          <p className="text-size-10 text-dark-disabled text-center pt-1">
            Every click on this card earns you referral credit when the viewer trades.
          </p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="bg-dark-gray4 px-3 py-2.5 text-center">
      <div className="text-size-9 text-dark-disabled uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={`text-size-14 font-manrope-extra-bold ${
          positive ? 'text-green-middle' : 'text-red-middle'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ShareAction({
  href,
  label,
  icon,
  bg,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-size-12 font-manrope-bold transition ${bg}`}
    >
      {icon}
      {label}
    </a>
  );
}

// ══════════════════════════════════════════════════════════════
// Formatting + intents
// ══════════════════════════════════════════════════════════════

function formatUsd(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${safeFixed(abs / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${sign}$${safeFixed(abs / 1_000, 2)}K`;
  if (abs >= 1) return `${sign}$${safeFixed(abs, 2)}`;
  return `${sign}$${safeFixed(abs, 4)}`;
}

function buildShareText(
  symbol: string,
  multiple: number,
  pnlUsd: number,
  positive: boolean,
): string {
  const mul = safeFixed(multiple, 2);
  const amount = formatUsd(pnlUsd);
  if (positive) {
    if (multiple >= 2) return `Just did ${mul}x on $${symbol} on @sidiorafun (${amount})`;
    return `Up ${amount} on $${symbol} trading on @sidiorafun`;
  }
  return `Holding $${symbol} through the dip on @sidiorafun`;
}

function buildXIntent(text: string, url: string): string {
  const q = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${q.toString()}`;
}

function buildTelegramIntent(text: string, url: string): string {
  const q = new URLSearchParams({ url, text });
  return `https://t.me/share/url?${q.toString()}`;
}

function displayShareUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

// ══════════════════════════════════════════════════════════════
// Icons
// ══════════════════════════════════════════════════════════════

function XIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.833.941z" />
    </svg>
  );
}

function TrophyIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 3h8v4a4 4 0 11-8 0V3zM4 5H2a2 2 0 002 2M12 5h2a2 2 0 01-2 2M8 11v2M6 14h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2v8m0 0L5 7m3 3l3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareOutIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11 2h3v3M14 2L8 8M12 9v4a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinkIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9.5 6.5l-3 3M7 4.5L8.5 3a3 3 0 014.5 4L11 8.5M9 11.5L7.5 13a3 3 0 01-4.5-4L4.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
