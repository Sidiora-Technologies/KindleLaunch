'use client';

/**
 * BestRouteSwapPanel — swap UI backed by the Meta-AG Router (best-route
 * aggregator over VaultAdapter + SidioraAdapter). Replaces the legacy
 * launchpad-only `swap-panel.tsx` for users who want optimal routing
 * across the protocol.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useOptimisticReceipt } from '@/hooks/tx/use-optimistic-receipt';
import { parseUnits, formatUnits, zeroAddress, maxUint256 } from 'viem';

import {
  useWriteErc20Approve,
  useReadErc20Allowance,
  useReadErc20Balance,
  useReadErc20Decimals,
} from '@/core/network/contracts';
import {
  META_AG_ROUTER_ADDRESS,
  useReadMetaAGRouterGetBestQuote,
  useReadMetaAGRouterGetAdapters,
  useWriteMetaAGRouterSwapBestRoute,
  normaliseBestQuote,
  normaliseAdapters,
  type MetaAGAdapterEntry,
} from '@/core/clients/meta-ag';
import { formatNumber, formatCurrency, safeFixed } from '@/utils/format';
import { useDebouncedValue } from '@/hooks/ui/use-debounced-value';
import TokenImage from '@/ui/shared/token-image';
import {
  loadMetaAgTokens,
  type MetaAgToken,
} from './token-universe';

const SLIPPAGE_BPS_DEFAULT = 100; // 1%
const DEADLINE_SECONDS = 300;

// ── Token Selector Modal ────────────────────────────────────────

function TokenSelectorModal({
  open,
  tokens,
  balances,
  onSelect,
  onClose,
  excludeAddress,
}: {
  open: boolean;
  tokens: MetaAgToken[];
  balances: Record<string, bigint>;
  onSelect: (t: MetaAgToken) => void;
  onClose: () => void;
  excludeAddress?: string;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const q = search.toLowerCase();
  const filtered = tokens.filter((t) => {
    if (excludeAddress && t.tokenAddress === excludeAddress.toLowerCase()) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      t.tokenAddress.includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[460px] mx-4 bg-dark-gray4 border border-dark-gray rounded-2xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="p-4 border-b border-dark-gray">
          <div className="flex items-center justify-between mb-3">
            <span className="text-size-14 font-manrope-bold text-white">Select a token</span>
            <button onClick={onClose} className="text-dark-disabled hover:text-white transition p-1" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, symbol, or address"
            className="w-full bg-dark-gray2 border border-dark-gray rounded-xl px-3 py-2.5 text-size-12 text-white outline-none focus:border-dark-gray6 transition placeholder:text-dark-disabled"
          />
        </div>

        <div className="overflow-y-auto flex-1 py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-dark-disabled text-size-12">No tokens found</div>
          )}
          {filtered.map((token) => {
            const bal = balances[token.tokenAddress];
            const balFmt = bal !== undefined ? parseFloat(formatUnits(bal, token.decimals)) : 0;
            return (
              <button
                key={token.tokenAddress}
                onClick={() => { onSelect(token); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-gray7/50 transition text-left"
              >
                <div className="relative w-9 h-9 rounded-full bg-dark-gray overflow-hidden flex-shrink-0 border border-dark-gray/70">
                  <TokenImage
                    fill
                    src={token.logo}
                    alt={token.symbol}
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-size-13 font-manrope-bold text-white truncate">{token.name}</span>
                    <span className="text-size-10 text-dark-disabled uppercase">{token.symbol}</span>
                    {token.kind === 'quote' && (
                      <span className="text-size-9 text-pink-middle bg-pink-middle/10 border border-pink-middle/30 rounded px-1.5 py-0.5 ml-1">Quote</span>
                    )}
                  </div>
                  {token.marketCap > 0 && (
                    <span className="text-size-10 text-dark-disabled">MC: {formatCurrency(token.marketCap)}</span>
                  )}
                </div>
                {balFmt > 0 && (
                  <span className="text-size-11 text-half-enabled font-manrope-bold flex-shrink-0">
                    {formatNumber(balFmt, 2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Token Input Box ─────────────────────────────────────────────

function TokenInputBox({
  label,
  token,
  amount,
  onAmountChange,
  balance,
  decimals,
  readOnly,
  onSelectClick,
  onMaxClick,
}: {
  label: string;
  token: MetaAgToken | null;
  amount: string;
  onAmountChange?: (v: string) => void;
  balance: bigint | null;
  decimals: number;
  readOnly?: boolean;
  onSelectClick: () => void;
  onMaxClick?: () => void;
}) {
  const balFmt = balance !== null ? parseFloat(formatUnits(balance, decimals)) : 0;
  const usdValue = token && amount && parseFloat(amount) > 0
    ? parseFloat(amount) * (token.price || 0)
    : 0;

  return (
    <div className="bg-dark-gray2 border border-dark-gray rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-size-10 text-dark-disabled uppercase tracking-wide">{label}</span>
        {balance !== null && (
          <div className="flex items-center gap-1.5">
            <span className="text-size-10 text-dark-disabled">Balance: {formatNumber(balFmt, 4)}</span>
            {onMaxClick && !readOnly && (
              <button
                onClick={onMaxClick}
                className="text-size-9 text-pink-middle hover:text-pink-middle2 font-manrope-bold transition"
              >
                MAX
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={onAmountChange ? (e) => onAmountChange(e.target.value) : undefined}
          readOnly={readOnly}
          placeholder="0.00"
          className={`flex-1 bg-transparent text-size-16 font-manrope-bold text-white outline-none min-w-0 ${
            readOnly ? 'cursor-default opacity-70' : ''
          }`}
          min="0"
          step="any"
        />
        <button
          onClick={onSelectClick}
          className="flex items-center gap-2 bg-dark-gray7 hover:bg-dark-gray8 border border-dark-gray6/50 rounded-xl px-3 py-2 transition flex-shrink-0"
        >
          {token ? (
            <>
              <div className="relative w-6 h-6 rounded-full bg-dark-gray overflow-hidden flex-shrink-0 border border-dark-gray/70">
                <TokenImage
                  fill
                  src={token.logo}
                  alt={token.symbol}
                  sizes="24px"
                  className="object-cover"
                />
              </div>
              <span className="text-size-13 font-manrope-bold text-white">{token.symbol}</span>
            </>
          ) : (
            <span className="text-size-12 font-manrope-bold text-half-enabled">Select token</span>
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-dark-disabled">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {usdValue > 0 && (
        <div className="mt-1">
          <span className="text-size-10 text-dark-disabled">{formatCurrency(usdValue)}</span>
        </div>
      )}
    </div>
  );
}

// ── Adapter resolver ────────────────────────────────────────────

function resolveAdapterName(
  adapters: MetaAGAdapterEntry[],
  adapterId?: `0x${string}`,
): string {
  if (!adapterId) return '—';
  const match = adapters.find(
    (a) => a.adapterId.toLowerCase() === adapterId.toLowerCase(),
  );
  if (match) return match.name || 'Adapter';
  // Fallback to short hash so the user always sees something stable.
  return `${adapterId.slice(0, 6)}…${adapterId.slice(-4)}`;
}

// ── Main Panel ──────────────────────────────────────────────────

export default function BestRouteSwapPanel() {
  const { address, isConnected } = useAccount();

  const [tokens, setTokens] = useState<MetaAgToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokenIn, setTokenIn] = useState<MetaAgToken | null>(null);
  const [tokenOut, setTokenOut] = useState<MetaAgToken | null>(null);
  const [amountIn, setAmountIn] = useState('');
  const [selectorFor, setSelectorFor] = useState<'in' | 'out' | null>(null);
  const [slippageBps, setSlippageBps] = useState<number>(SLIPPAGE_BPS_DEFAULT);

  // ── Token universe load ───────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    setTokensLoading(true);
    loadMetaAgTokens(ctrl.signal)
      .then((list) => setTokens(list))
      .finally(() => setTokensLoading(false));
    return () => ctrl.abort();
  }, []);

  // Sensible default pair: USDL → WPAX. Once tokens are loaded, set if
  // the user hasn't picked yet.
  useEffect(() => {
    if (tokens.length === 0) return;
    if (!tokenIn) setTokenIn(tokens.find((t) => t.symbol === 'USDL') ?? tokens[0]);
    if (!tokenOut) setTokenOut(tokens.find((t) => t.symbol === 'WPAX') ?? tokens[1] ?? null);
  }, [tokens, tokenIn, tokenOut]);

  // ── Adapters list (for naming the route) ──────────────────────
  const { data: adaptersRaw } = useReadMetaAGRouterGetAdapters();
  const adapters = useMemo(() => normaliseAdapters(adaptersRaw), [adaptersRaw]);

  // ── Decimals ──────────────────────────────────────────────────
  // For known quote tokens use the curated value; for launchpad
  // tokens the curated value is 6 (factory default). Read on-chain
  // anyway so the UI stays correct if a future token uses a different
  // decimal count.
  const tokenInAddr = (tokenIn?.tokenAddress || zeroAddress) as `0x${string}`;
  const tokenOutAddr = (tokenOut?.tokenAddress || zeroAddress) as `0x${string}`;
  const userAddr = (address || zeroAddress) as `0x${string}`;

  const { data: tokenInDecRaw } = useReadErc20Decimals({ token: tokenInAddr });
  const { data: tokenOutDecRaw } = useReadErc20Decimals({ token: tokenOutAddr });
  const tokenInDec =
    tokenInDecRaw !== undefined && tokenInDecRaw !== null
      ? Number(tokenInDecRaw)
      : tokenIn?.decimals ?? 18;
  const tokenOutDec =
    tokenOutDecRaw !== undefined && tokenOutDecRaw !== null
      ? Number(tokenOutDecRaw)
      : tokenOut?.decimals ?? 18;

  // ── Balances ──────────────────────────────────────────────────
  const { data: balInRaw, refetch: refetchBalIn } = useReadErc20Balance({ token: tokenInAddr, account: userAddr });
  const { data: balOutRaw, refetch: refetchBalOut } = useReadErc20Balance({ token: tokenOutAddr, account: userAddr });
  const balIn = balInRaw !== undefined && balInRaw !== null ? BigInt(String(balInRaw)) : null;
  const balOut = balOutRaw !== undefined && balOutRaw !== null ? BigInt(String(balOutRaw)) : null;

  const balances = useMemo(() => {
    const map: Record<string, bigint> = {};
    if (tokenIn && balIn !== null) map[tokenIn.tokenAddress] = balIn;
    if (tokenOut && balOut !== null) map[tokenOut.tokenAddress] = balOut;
    return map;
  }, [tokenIn, tokenOut, balIn, balOut]);

  // ── Allowance against MetaAGRouter ────────────────────────────
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadErc20Allowance({
    token: tokenInAddr,
    owner: userAddr,
    spender: META_AG_ROUTER_ADDRESS,
  });
  const allowance = allowanceRaw !== undefined && allowanceRaw !== null ? BigInt(String(allowanceRaw)) : null;

  // ── Quote via MetaAGRouter.getBestQuote ───────────────────────
  const hasAmount = amountIn !== '' && parseFloat(amountIn) > 0;
  let parsedAmountIn = 0n;
  let parseFailed = false;
  if (hasAmount) {
    try { parsedAmountIn = parseUnits(amountIn, tokenInDec); } catch { parseFailed = true; }
  }
  const debouncedParsedAmountIn = useDebouncedValue(parsedAmountIn, 250);
  const debouncedHasAmount = debouncedParsedAmountIn > 0n;
  const sameToken = tokenIn && tokenOut && tokenIn.tokenAddress === tokenOut.tokenAddress;
  const canQuote = !!tokenIn && !!tokenOut && hasAmount && !sameToken && !parseFailed;

  const { data: bestQuoteRaw, isLoading: quoteLoading } =
    useReadMetaAGRouterGetBestQuote(
      { tokenIn: tokenInAddr, tokenOut: tokenOutAddr, amountIn: debouncedParsedAmountIn },
      canQuote && debouncedHasAmount,
    );

  const bestQuote = useMemo(() => normaliseBestQuote(bestQuoteRaw), [bestQuoteRaw]);

  const estOut = bestQuote && bestQuote.found
    ? parseFloat(formatUnits(bestQuote.amountOut, tokenOutDec))
    : null;
  const feeBps = bestQuote && bestQuote.found ? Number(bestQuote.feeBps) / 100 : null;
  const priceImpact = bestQuote && bestQuote.found ? Number(bestQuote.priceImpactBps) / 100 : null;
  const adapterName = bestQuote && bestQuote.found
    ? resolveAdapterName(adapters, bestQuote.adapterId)
    : null;

  // amountOutMin = expectedOut * (1 - slippage)
  const amountOutMin = useMemo(() => {
    if (!bestQuote || !bestQuote.found || bestQuote.amountOut === 0n) return 0n;
    return (bestQuote.amountOut * BigInt(10000 - slippageBps)) / 10000n;
  }, [bestQuote, slippageBps]);

  // ── Approval state ────────────────────────────────────────────
  const needsApproval = hasAmount && allowance !== null && allowance < parsedAmountIn;
  const { write: writeApprove, isPending: approvePending, data: approveTxHash } = useWriteErc20Approve();
  const { receipt: approveReceipt } = useOptimisticReceipt(approveTxHash);
  const approveConfirming = approvePending || (!!approveTxHash && !approveReceipt);

  useEffect(() => {
    if (approveReceipt) refetchAllowance();
  }, [approveReceipt, refetchAllowance]);

  // ── Swap execution ────────────────────────────────────────────
  const { write: writeSwap, isPending: swapPending, data: swapTxHash, error: swapError } =
    useWriteMetaAGRouterSwapBestRoute();
  const { receipt: swapReceipt } = useOptimisticReceipt(swapTxHash);

  useEffect(() => {
    if (swapReceipt) {
      setAmountIn('');
      refetchBalIn();
      refetchBalOut();
      refetchAllowance();
    }
  }, [swapReceipt, refetchBalIn, refetchBalOut, refetchAllowance]);

  const insufficientBalance = hasAmount && balIn !== null && balIn < parsedAmountIn;
  const noRoute = canQuote && bestQuote !== null && !bestQuote.found;
  const isPending = swapPending || approveConfirming;

  const handleSwap = () => {
    if (!isConnected || !canQuote || !bestQuote?.found) return;
    if (needsApproval) {
      writeApprove({ token: tokenInAddr, spender: META_AG_ROUTER_ADDRESS, amount: parsedAmountIn });
      return;
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
    writeSwap({
      tokenIn: tokenInAddr,
      tokenOut: tokenOutAddr,
      amountIn: parsedAmountIn,
      amountOutMin,
      deadline,
    });
  };

  const handleFlip = useCallback(() => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn('');
  }, [tokenIn, tokenOut]);

  const handleMaxIn = () => {
    if (balIn !== null) setAmountIn(formatUnits(balIn, tokenInDec));
  };

  // ── Button label ──────────────────────────────────────────────
  const buttonLabel = (() => {
    if (!isConnected) return 'Connect Wallet';
    if (!tokenIn) return 'Select input token';
    if (!tokenOut) return 'Select output token';
    if (sameToken) return 'Select different tokens';
    if (!hasAmount) return 'Enter an amount';
    if (parseFailed) return 'Invalid amount';
    if (insufficientBalance) return `Insufficient ${tokenIn.symbol} balance`;
    if (noRoute) return 'No route available';
    if (approveConfirming) return `Approving ${tokenIn.symbol}...`;
    if (swapPending) return 'Confirming swap...';
    if (needsApproval) return `Approve ${tokenIn.symbol}`;
    return `Swap via ${adapterName ?? 'Meta-AG'}`;
  })();

  const buttonDisabled =
    !isConnected || !canQuote || !hasAmount || isPending || insufficientBalance || noRoute;

  const effectiveRate =
    estOut !== null && parseFloat(amountIn) > 0
      ? estOut / parseFloat(amountIn)
      : null;

  return (
    <div className="w-full max-w-[480px] mx-auto">
      <div className="border border-dark-gray rounded-2xl bg-dark-gray4/80 backdrop-blur-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-size-16 font-manrope-bold text-white">Best-Route Swap</h2>
            <span className="text-size-9 px-1.5 py-0.5 rounded bg-pink-middle/15 text-pink-middle border border-pink-middle/30 font-manrope-bold uppercase tracking-wider">
              Meta-AG
            </span>
          </div>
          <SlippageButton bps={slippageBps} onChange={setSlippageBps} />
        </div>

        <div className="px-4 pb-4 space-y-1 relative">
          {/* Token In */}
          <TokenInputBox
            label="You pay"
            token={tokenIn}
            amount={amountIn}
            onAmountChange={setAmountIn}
            balance={isConnected ? balIn : null}
            decimals={tokenInDec}
            onSelectClick={() => setSelectorFor('in')}
            onMaxClick={handleMaxIn}
          />

          {/* Flip */}
          <div className="flex justify-center -my-3 relative z-10">
            <button
              onClick={handleFlip}
              className="w-10 h-10 rounded-xl bg-dark-gray7 border-2 border-dark-gray4/80 hover:bg-dark-gray8 transition flex items-center justify-center group"
              title="Switch tokens"
              aria-label="Flip"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
                className="text-half-enabled group-hover:text-white transition group-hover:rotate-180 duration-300">
                <path d="M9 3V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M5 11L9 15L13 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Token Out */}
          <TokenInputBox
            label="You receive"
            token={tokenOut}
            amount={estOut !== null ? safeFixed(estOut, 6) : ''}
            balance={isConnected ? balOut : null}
            decimals={tokenOutDec}
            readOnly
            onSelectClick={() => setSelectorFor('out')}
          />

          {/* Quote details */}
          {canQuote && (
            <div className="border border-dark-gray rounded-xl p-3.5 mt-3 space-y-2 bg-dark-gray2/30">
              {quoteLoading && !bestQuote && (
                <div className="text-size-11 text-dark-disabled text-center animate-pulse py-2">Routing…</div>
              )}
              {noRoute && (
                <div className="text-size-11 text-red-middle text-center py-2">
                  No registered adapter can serve this pair.
                </div>
              )}
              {bestQuote && bestQuote.found && (
                <>
                  {/* Route */}
                  <div className="flex justify-between text-size-11">
                    <span className="text-dark-disabled">Route</span>
                    <span className="text-white font-manrope-bold flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-green-opacity-005 border border-green-middle4 text-green-middle text-size-10">
                        {adapterName}
                      </span>
                    </span>
                  </div>

                  {/* Rate */}
                  {effectiveRate !== null && (
                    <div className="flex justify-between text-size-11">
                      <span className="text-dark-disabled">Rate</span>
                      <span className="text-white font-manrope-bold">
                        1 {tokenIn?.symbol} = {formatNumber(effectiveRate, 6)} {tokenOut?.symbol}
                      </span>
                    </div>
                  )}

                  {/* Price impact */}
                  {priceImpact !== null && (
                    <div className="flex justify-between text-size-11">
                      <span className="text-dark-disabled">Price impact</span>
                      <span className={`font-manrope-bold ${
                        priceImpact > 5 ? 'text-red-middle' :
                        priceImpact > 1 ? 'text-yellow-middle' : 'text-green-middle'
                      }`}>
                        {safeFixed(priceImpact, 2)}%
                      </span>
                    </div>
                  )}

                  {/* Fee */}
                  {feeBps !== null && (
                    <div className="flex justify-between text-size-11">
                      <span className="text-dark-disabled">Adapter fee</span>
                      <span className="text-dark-disabled">{safeFixed(feeBps, 2)}%</span>
                    </div>
                  )}

                  {/* Min received */}
                  <div className="flex justify-between text-size-11 pt-1 border-t border-dark-gray/50">
                    <span className="text-dark-disabled">Min received ({safeFixed(Number(slippageBps) / 100, 2)}% slip)</span>
                    <span className="text-half-enabled font-manrope-bold">
                      {tokenOut
                        ? `${formatNumber(parseFloat(formatUnits(amountOutMin, tokenOutDec)), 6)} ${tokenOut.symbol}`
                        : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Insufficient balance warning */}
          {insufficientBalance && (
            <div className="text-red-middle text-size-11 text-center py-1.5">
              Insufficient {tokenIn?.symbol} balance
            </div>
          )}

          {/* Swap / Approve button */}
          <button
            onClick={handleSwap}
            disabled={buttonDisabled}
            className={`w-full py-3.5 rounded-xl text-size-14 font-manrope-bold transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed ${
              insufficientBalance || noRoute
                ? 'bg-red-middle/20 text-red-middle border border-red-middle/40'
                : needsApproval
                  ? 'bg-pink-middle/20 text-pink-middle border border-pink-middle/40 hover:bg-pink-middle/30'
                  : 'bg-green-middle text-black-gray hover:bg-green-middle2'
            }`}
          >
            {buttonLabel}
          </button>

          {swapError && (
            <div className="text-red-middle text-size-11 text-center py-1 break-all">
              {swapError.message?.slice(0, 200)}
            </div>
          )}

          {swapReceipt && (
            <div className="text-green-middle text-size-11 text-center py-1">
              Swap confirmed ✓
            </div>
          )}
        </div>
      </div>

      {/* Loading state */}
      {tokensLoading && tokens.length === 0 && (
        <div className="text-center text-dark-disabled text-size-11 mt-4 animate-pulse">
          Loading tokens…
        </div>
      )}

      {/* Token Selector Modal */}
      <TokenSelectorModal
        open={selectorFor !== null}
        tokens={tokens}
        balances={balances}
        onSelect={(t) => {
          if (selectorFor === 'in') setTokenIn(t);
          else setTokenOut(t);
          setSelectorFor(null);
        }}
        onClose={() => setSelectorFor(null)}
        excludeAddress={selectorFor === 'in' ? tokenOut?.tokenAddress : tokenIn?.tokenAddress}
      />
    </div>
  );
}

// ── Slippage selector ───────────────────────────────────────────

function SlippageButton({ bps, onChange }: { bps: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const presets = [50, 100, 300, 500];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-size-10 text-dark-disabled hover:text-white transition px-2.5 py-1 rounded-lg border border-dark-gray bg-dark-gray2/40"
        title="Slippage tolerance"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1" />
          <path d="M3 5.5L5 7.5L8.5 4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Slippage {safeFixed(bps / 100, 2)}%
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-dark-gray4 border border-dark-gray rounded-xl p-2 flex gap-1">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => { onChange(p); setOpen(false); }}
              className={`px-2.5 py-1 rounded text-size-10 font-manrope-bold transition ${
                p === bps
                  ? 'bg-green-middle text-black-gray'
                  : 'border border-dark-gray text-half-enabled hover:bg-dark-gray/40'
              }`}
            >
              {safeFixed(p / 100, 2)}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
