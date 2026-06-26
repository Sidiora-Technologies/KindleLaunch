'use client';

import { formatUnits } from 'viem';
import { sanitizeNumericInput } from '@/utils/validate-numeric-input';
import { formatNumber, formatPrice, safeFixed } from '@/utils/format';

const BUY_PRESETS = ['25', '100', '250'] as const;
const SELL_PCTS = [25, 50, 75, 100] as const;

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

// ── Buy/Sell tabs ────────────────────────────────────────────

interface TradeTabsProps {
  isBuy: boolean;
  onSwitch: (buy: boolean) => void;
  slippageNode: React.ReactNode;
}

export function TradeTabs({ isBuy, onSwitch, slippageNode }: TradeTabsProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-0 flex-1">
        <button
          onClick={() => onSwitch(true)}
          className={`px-6 py-2 rounded-full text-size-13 font-manrope-bold transition ${
            isBuy ? 'bg-green-middle text-black' : 'text-dark-disabled hover:text-half-enabled'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => onSwitch(false)}
          className={`px-6 py-2 rounded-full text-size-13 font-manrope-bold transition ${
            !isBuy ? 'bg-red-middle text-white' : 'text-dark-disabled hover:text-half-enabled'
          }`}
        >
          Sell
        </button>
      </div>
      {slippageNode}
    </div>
  );
}

// ── Amount input ─────────────────────────────────────────────

interface AmountInputProps {
  amount: string;
  onChange: (v: string) => void;
  inputDecimals: number;
}

export function AmountInput({ amount, onChange, inputDecimals }: AmountInputProps) {
  return (
    <div className="flex items-center justify-center py-4">
      <span className="text-dark-disabled text-[24px] mr-1">$</span>
      <input
        type="number"
        value={amount}
        onChange={(e) => onChange(sanitizeNumericInput(e.target.value, inputDecimals))}
        placeholder="0"
        className="bg-transparent text-[40px] font-manrope-bold text-white outline-none w-auto max-w-[160px] text-center appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
        min="0"
        step="any"
        style={{ width: `${Math.max(1, (amount || '0').length) * 28}px` }}
      />
      <span className="text-dark-disabled text-size-13 ml-2">USD ₮</span>
    </div>
  );
}

// ── Presets / sell-percent row ───────────────────────────────

interface BuyPresetsProps {
  amount: string;
  onSelect: (preset: string) => void;
}

export function BuyPresets({ amount, onSelect }: BuyPresetsProps) {
  return (
    <div className="flex items-center justify-between px-2">
      {BUY_PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => onSelect(preset)}
          className={`text-size-14 font-manrope-bold transition ${
            amount === preset ? 'text-white' : 'text-half-enabled hover:text-white'
          }`}
        >
          ${preset}
        </button>
      ))}
      <button className="text-dark-disabled hover:text-half-enabled transition">
        <SettingsIcon />
      </button>
    </div>
  );
}

interface SellPctsProps {
  tokenBalance: bigint | null;
  tokenDecimals: number;
  amount: string;
  onSelect: (pct: number) => void;
}

export function SellPcts({ tokenBalance, tokenDecimals, amount, onSelect }: SellPctsProps) {
  return (
    <div className="flex items-center justify-between px-2">
      {SELL_PCTS.map((pct) => {
        const portion = tokenBalance !== null ? (tokenBalance * BigInt(pct)) / 100n : 0n;
        const isActive = tokenBalance !== null && amount === formatUnits(portion, tokenDecimals);
        return (
          <button
            key={pct}
            onClick={() => onSelect(pct)}
            className={`text-size-14 font-manrope-bold transition ${
              isActive ? 'text-white' : 'text-half-enabled hover:text-white'
            }`}
          >
            {pct}%
          </button>
        );
      })}
      <button className="text-dark-disabled hover:text-half-enabled transition">
        <SettingsIcon />
      </button>
    </div>
  );
}

// ── Balance row ──────────────────────────────────────────────

interface BalanceRowProps {
  isBuy: boolean;
  usdlBalFmt: number;
  tokenBalFmt: number;
  tokenName: string;
  poolPrice?: string;
  onMax: () => void;
}

export function BalanceRow({ isBuy, usdlBalFmt, tokenBalFmt, tokenName, poolPrice, onMax }: BalanceRowProps) {
  return (
    <div className="flex items-center justify-between text-size-12">
      <div className="flex items-center gap-1.5">
        <span className="text-dark-disabled">Balance</span>
        <span className="text-white font-manrope-bold">
          {isBuy
            ? `${formatNumber(usdlBalFmt, 3)} USDL`
            : `${formatNumber(tokenBalFmt, 3)} ${tokenName || 'Tokens'}`}
        </span>
        {poolPrice && (
          <span className="text-dark-disabled">({formatPrice(poolPrice)})</span>
        )}
      </div>
      <button
        onClick={onMax}
        className="text-white font-manrope-bold text-size-12 hover:text-green-middle transition"
      >
        MAX
      </button>
    </div>
  );
}

// ── Quote preview ────────────────────────────────────────────

interface TradePreviewProps {
  isBuy: boolean;
  tokenName: string;
  estOutput: number | null;
  priceImpact: number | null;
}

export function TradePreview({ isBuy, tokenName, estOutput, priceImpact }: TradePreviewProps) {
  return (
    <div className="space-y-1.5 px-1">
      <div className="flex justify-between text-size-11">
        <span className="text-dark-disabled">
          {isBuy ? `Est. ${tokenName || 'tokens'} received` : 'Est. USDL returned'}
        </span>
        <span className="text-white font-manrope-bold">
          {estOutput !== null ? formatNumber(estOutput, 4) : '...'}
        </span>
      </div>
      <div className="flex justify-between text-size-11">
        <span className="text-dark-disabled">Price impact</span>
        <span className={`font-manrope-bold ${
          priceImpact !== null && priceImpact > 5 ? 'text-red-middle' :
          priceImpact !== null && priceImpact > 1 ? 'text-yellow-middle' : 'text-green-middle'
        }`}>
          {priceImpact !== null ? `${safeFixed(priceImpact, 2)}%` : '...'}
        </span>
      </div>
    </div>
  );
}

// ── Approval checkbox ────────────────────────────────────────

interface ApprovalCheckboxProps {
  unlimited: boolean;
  onChange: (v: boolean) => void;
}

export function ApprovalCheckbox({ unlimited, onChange }: ApprovalCheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-size-10 text-dark-disabled cursor-pointer">
      <input
        type="checkbox"
        checked={unlimited}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-dark-gray bg-dark-gray2"
      />
      <span>Approve unlimited <span className="text-size-9">(fewer future approvals, higher risk if router is compromised)</span></span>
    </label>
  );
}

// ── Main action button ───────────────────────────────────────

interface ActionButtonProps {
  isConnected: boolean;
  hasAmount: boolean;
  insufficientBalance: boolean;
  approveConfirming: boolean;
  buyPending: boolean;
  sellPending: boolean;
  needsApproval: boolean;
  isBuy: boolean;
  tokenName: string;
  isPending: boolean;
  quoteUnavailable: boolean;
  onClick: () => void;
}

export function ActionButton(props: ActionButtonProps) {
  const {
    isConnected, hasAmount, insufficientBalance, approveConfirming,
    buyPending, sellPending, needsApproval, isBuy, tokenName,
    isPending, quoteUnavailable, onClick,
  } = props;

  return (
    <button
      onClick={onClick}
      disabled={!isConnected || !hasAmount || isPending || insufficientBalance || quoteUnavailable}
      className={`w-full py-3 rounded-full text-size-14 font-manrope-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
        insufficientBalance
          ? 'bg-red-middle/20 text-red-middle border border-red-middle/40'
          : isBuy
            ? 'bg-green-middle text-black hover:bg-green-middle2'
            : 'bg-red-middle text-white hover:bg-red-middle3'
      }`}
    >
      {!isConnected
        ? 'Connect Wallet'
        : insufficientBalance
          ? `Insufficient ${isBuy ? 'USDL' : tokenName || 'Token'} Balance`
          : approveConfirming
            ? `Approving ${isBuy ? 'USDL' : tokenName || 'Token'}...`
            : buyPending || sellPending
              ? 'Confirming...'
              : needsApproval
                ? (isBuy ? 'Approve USDL' : `Approve ${tokenName || 'Token'}`)
                : !hasAmount
                  ? 'Enter an amount'
                  : isBuy
                    ? `Buy ${tokenName || 'Token'}`
                    : `Sell ${tokenName || 'Token'}`}
    </button>
  );
}

// ── Footer (fee + slippage) ──────────────────────────────────

interface FeeFooterProps {
  feePercent: number | null;
  slippageBps: number;
}

export function FeeFooter({ feePercent, slippageBps }: FeeFooterProps) {
  return (
    <div className="flex items-center justify-end gap-1.5 text-size-11 text-dark-disabled">
      <SettingsIcon />
      <span>{feePercent !== null ? `${feePercent}%` : `${slippageBps / 100}%`}</span>
      <span>·</span>
      <span>Turbo</span>
    </div>
  );
}

// ── Share PNL button ─────────────────────────────────────────

interface SharePnlButtonProps {
  tokenName: string;
  state: 'idle' | 'minting' | 'ready' | 'error';
  errorMessage?: string;
  onClick: () => void;
}

export function SharePnlButton({ tokenName, state, errorMessage, onClick }: SharePnlButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={state === 'minting'}
      className="w-full py-2 rounded-full text-size-11 font-manrope-bold border border-green-middle/30 bg-green-middle/10 text-green-middle hover:bg-green-middle/20 transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
      title="Mint a shareable PNL card for your position"
    >
      {state === 'minting' ? (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="animate-spin">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Creating card…
        </>
      ) : state === 'error' ? (
        <span className="text-red-middle">{errorMessage}</span>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M12 5l3-3m0 0l-3-3m3 3H8a3 3 0 00-3 3v3m-2 0l-3 3m0 0l3 3m-3-3h7a3 3 0 003-3V5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Share my ${tokenName || 'position'} PNL
        </>
      )}
    </button>
  );
}
