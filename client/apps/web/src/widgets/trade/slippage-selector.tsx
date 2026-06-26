'use client';

import { useState } from 'react';
import { safeFixed } from '@/utils/format';

const SLIPPAGE_PRESETS = [50, 100, 300] as const;
export const DEFAULT_SLIPPAGE_BPS = 100;

export function SlippageSelector({
  bps,
  onChange,
}: {
  bps: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const isCustom = !SLIPPAGE_PRESETS.includes(bps as any);

  const handleCustom = () => {
    const val = parseFloat(custom);
    if (!Number.isFinite(val) || val <= 0 || val > 50) return;
    onChange(Math.round(val * 100));
    setOpen(false);
    setCustom('');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-size-10 text-dark-disabled hover:text-white transition px-2 py-1 rounded-lg border border-dark-gray bg-dark-gray2/40"
        title="Slippage tolerance"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1" />
          <path d="M3 5.5L5 7.5L8.5 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {safeFixed(bps / 100, bps % 100 === 0 ? 1 : 2)}%
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-dark-gray4 border border-dark-gray rounded-xl p-2 space-y-1.5 min-w-[180px]">
          <div className="flex gap-1">
            {SLIPPAGE_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => { onChange(p); setOpen(false); }}
                className={`flex-1 px-2 py-1 rounded text-size-10 font-manrope-bold transition ${
                  p === bps
                    ? 'bg-green-middle text-black-gray'
                    : 'border border-dark-gray text-half-enabled hover:bg-dark-gray/40'
                }`}
              >
                {safeFixed(p / 100, 1)}%
              </button>
            ))}
          </div>
          <div className="flex gap-1 items-center">
            <input
              type="number"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCustom(); }}
              placeholder="Custom %"
              min="0.01"
              max="50"
              step="0.1"
              className="flex-1 bg-dark-gray2 border border-dark-gray rounded px-2 py-1 text-size-10 text-white outline-none min-w-0"
            />
            <button
              onClick={handleCustom}
              className="px-2 py-1 rounded text-size-10 font-manrope-bold border border-dark-gray text-half-enabled hover:bg-dark-gray/40 transition"
            >
              Set
            </button>
          </div>
          {isCustom && (
            <div className="text-size-9 text-dark-disabled text-center">
              Custom: {safeFixed(bps / 100, 2)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function computeMinOut(quotedOut: bigint, slippageBps: number): bigint {
  if (quotedOut === 0n) return 0n;
  return (quotedOut * BigInt(10000 - slippageBps)) / 10000n;
}

export function HighImpactWarning({
  priceImpactBps,
  onConfirm,
  onCancel,
}: {
  priceImpactBps: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const pct = safeFixed(Number(priceImpactBps) / 100, 2);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-[360px] mx-4 bg-dark-gray4 border border-red-middle/40 rounded-2xl p-5 space-y-4">
        <div className="text-center space-y-2">
          <div className="text-size-16 font-manrope-bold text-red-middle">High Price Impact</div>
          <div className="text-size-12 text-half-enabled">
            This trade has a price impact of <span className="font-manrope-bold text-red-middle">{pct}%</span>.
            You may receive significantly fewer tokens than expected.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-size-12 font-manrope-bold border border-dark-gray text-half-enabled hover:bg-dark-gray/40 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-size-12 font-manrope-bold bg-red-middle/20 text-red-middle border border-red-middle/40 hover:bg-red-middle/30 transition"
          >
            Trade Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
