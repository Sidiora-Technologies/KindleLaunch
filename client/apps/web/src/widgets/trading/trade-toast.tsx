'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatNumber } from '@/utils/format';

export interface TradeToastData {
  type: 'buy' | 'sell';
  inputAmount: number;
  inputSymbol: string;
  outputAmount: number;
  outputSymbol: string;
  newUsdlBalance: number;
  newTokenBalance: number;
  tokenName: string;
  txHash: string;
}

interface TradeToastProps {
  data: TradeToastData;
  onDismiss: () => void;
  /** If provided, renders a "Share PNL" button at the bottom of the toast. */
  onShare?: () => void;
  /** When true, auto-dismiss + progress bar pause (mint in flight, modal imminent). */
  sharing?: boolean;
  /** Optional error text (e.g. from a failed mint) shown under the share button. */
  shareError?: string | null;
}

export default function TradeToast({
  data,
  onDismiss,
  onShare,
  sharing = false,
  shareError,
}: TradeToastProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  // Slide-in once on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-dismiss after 6s — paused while a mint is in flight or an error is shown.
  useEffect(() => {
    if (sharing || shareError) return;
    const timer = setTimeout(() => dismiss(), 6000);
    return () => clearTimeout(timer);
  }, [dismiss, sharing, shareError]);

  const isBuy = data.type === 'buy';
  const truncatedHash = data.txHash
    ? `${data.txHash.slice(0, 6)}...${data.txHash.slice(-4)}`
    : '';

  return (
    <div
      className={`fixed bottom-24 sm:bottom-5 left-3 right-3 sm:left-auto sm:right-5 z-[9999] w-auto sm:w-[320px] transition-all duration-300 ease-out ${
        visible && !exiting
          ? 'translate-y-0 opacity-100'
          : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="border border-dark-gray7 rounded-xl bg-dark-gray4 shadow-lg overflow-hidden">
        {/* Header strip */}
        <div className={`flex items-center gap-2 px-3 py-2 ${isBuy ? 'bg-green-opacity-015' : 'bg-red-opacity-015'}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isBuy ? 'bg-green-middle/20' : 'bg-red-middle/20'}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6L5 9L10 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isBuy ? 'text-green-middle' : 'text-red-middle'}
              />
            </svg>
          </div>
          <span className={`text-size-12 font-manrope-bold ${isBuy ? 'text-green-middle' : 'text-red-middle'}`}>
            {isBuy ? 'Buy' : 'Sell'} Confirmed
          </span>
          <button
            onClick={dismiss}
            className="ml-auto text-dark-disabled hover:text-half-enabled transition p-0.5"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5 space-y-2">
          {/* Trade summary */}
          <div className="flex items-center justify-between">
            <span className="text-size-11 text-dark-disabled">
              {isBuy ? 'Spent' : 'Sold'}
            </span>
            <span className="text-size-12 text-half-enabled font-manrope-bold">
              {formatNumber(data.inputAmount, 2)} {data.inputSymbol}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-size-11 text-dark-disabled">
              {isBuy ? 'Received' : 'Returned'}
            </span>
            <span className={`text-size-12 font-manrope-bold ${isBuy ? 'text-green-middle' : 'text-red-middle'}`}>
              {formatNumber(data.outputAmount, 4)} {data.outputSymbol}
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-dark-gray7" />

          {/* Updated balances */}
          <div className="space-y-1">
            <div className="text-size-10 text-dark-disabled uppercase tracking-wider">
              Updated Balances
            </div>
            <div className="flex items-center justify-between">
              <span className="text-size-11 text-dark-gray9">USDL</span>
              <span className="text-size-11 text-half-enabled font-manrope-bold tabular-nums">
                {formatNumber(data.newUsdlBalance, 2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-size-11 text-dark-gray9">
                {data.tokenName || 'Token'}
              </span>
              <span className="text-size-11 text-half-enabled font-manrope-bold tabular-nums">
                {formatNumber(data.newTokenBalance, 4)}
              </span>
            </div>
          </div>

          {/* Tx hash */}
          {truncatedHash && (
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-size-9 text-dark-disabled">Tx</span>
              <span className="text-size-9 text-dark-gray9 font-mono">
                {truncatedHash}
              </span>
            </div>
          )}

          {/* Share PNL CTA */}
          {onShare && (
            <div className="pt-2">
              <button
                onClick={onShare}
                disabled={sharing}
                className="w-full py-2 rounded-lg text-size-11 font-manrope-bold bg-green-middle text-black hover:bg-green-middle2 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                {sharing ? (
                  <>
                    <Spinner />
                    Creating card…
                  </>
                ) : (
                  <>
                    <ShareIcon />
                    Share PNL
                  </>
                )}
              </button>
              {shareError && (
                <p className="text-size-10 text-red-middle text-center pt-1">
                  {shareError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Progress bar (auto-dismiss countdown) */}
        <div className="h-[2px] bg-dark-gray7">
          <div
            className={isBuy ? 'h-full bg-green-middle' : 'h-full bg-red-middle'}
            style={{
              animation: 'toast-progress 6s linear forwards',
              animationPlayState: sharing || shareError ? 'paused' : 'running',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M12 5l3-3m0 0l-3-3m3 3H8a3 3 0 00-3 3v3m-2 0l-3 3m0 0l3 3m-3-3h7a3 3 0 003-3V5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14 8a6 6 0 00-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
