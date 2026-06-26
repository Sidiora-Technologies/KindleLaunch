'use client';

import { useCallback } from 'react';
import SharePnlModal from './share-pnl-modal';
import { useCardMinter } from './use-card-minter';

// ══════════════════════════════════════════════════════════════
// ShareCardButton — one-click mint + share popover.
// No signature, no wallet popup. Backend gates on position existence.
// ══════════════════════════════════════════════════════════════

export type ShareCardButtonVariant = 'primary' | 'compact' | 'ghost';

interface ShareCardButtonProps {
  /** The pool whose position to card. */
  poolAddress: string;
  /** Wallet that owns the position. Must have a position in pnl.user_positions. */
  ownerAddress?: string | null;
  /** Optional — pre-fills the modal with the right token symbol while minting. */
  tokenSymbol?: string | null;
  variant?: ShareCardButtonVariant;
  className?: string;
  label?: string;
}

export default function ShareCardButton({
  poolAddress,
  ownerAddress,
  tokenSymbol,
  variant = 'primary',
  className = '',
  label,
}: ShareCardButtonProps) {
  const { mint, reset, state, card } = useCardMinter();

  const handleClick = useCallback(() => {
    if (!ownerAddress || !poolAddress) return;
    if (state.kind === 'minting') return;
    mint({ ownerAddress, poolAddress });
  }, [ownerAddress, poolAddress, state.kind, mint]);

  const disabled = !ownerAddress || !poolAddress || state.kind === 'minting';
  const isError = state.kind === 'error';
  const buttonLabel =
    label ??
    (state.kind === 'minting'
      ? 'Creating…'
      : tokenSymbol
        ? `Share ${tokenSymbol} PNL`
        : 'Share PNL');

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled}
        className={buttonStyle(variant, className, isError)}
      >
        <ShareIcon className="w-3.5 h-3.5" />
        {isError ? state.message : buttonLabel}
      </button>

      {card && (
        <SharePnlModal
          card={card}
          tokenSymbol={tokenSymbol ?? card.snapshot.tokenSymbol ?? null}
          onClose={reset}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Styling helpers
// ══════════════════════════════════════════════════════════════

function buttonStyle(
  variant: ShareCardButtonVariant,
  extra: string,
  isError: boolean,
): string {
  const base =
    'inline-flex items-center justify-center gap-1.5 font-manrope-bold transition disabled:opacity-50 disabled:cursor-not-allowed';

  const variants: Record<ShareCardButtonVariant, string> = {
    primary:
      'px-3 py-1.5 rounded-lg text-size-11 bg-green-middle text-black hover:bg-green-middle2',
    compact:
      'px-2.5 py-1 rounded-md text-size-10 bg-green-middle/15 text-green-middle border border-green-middle/30 hover:bg-green-middle/25',
    ghost:
      'px-2 py-1 rounded-md text-size-11 text-green-middle hover:bg-green-middle/10',
  };

  const errorOverride = isError
    ? 'bg-red-middle/15 text-red-middle border border-red-middle/30 hover:bg-red-middle/25'
    : '';

  return [base, errorOverride || variants[variant], extra].filter(Boolean).join(' ');
}

function ShareIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10.5 3.5L13 1m0 0L10.5-1M13 1H6.5a4 4 0 00-4 4v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 12.5L3 15m0 0l2.5 2.5M3 15h6.5a4 4 0 004-4v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0 -4)"
      />
    </svg>
  );
}
