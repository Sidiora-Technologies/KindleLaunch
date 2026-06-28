'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useOptimisticReceipt } from '@/hooks/tx/use-optimistic-receipt';
import {
  useWriteRouterSwapTokenForToken,
  useWriteErc20Approve,
  useReadErc20Allowance,
  useReadErc20Balance,
  useReadErc20Decimals,
  useReadQuoterQuoteMultihop,
  ROUTER_ADDRESS,
  USDL_ADDRESS,
} from '@/core/network/contracts';
import { parseUnits, formatUnits, zeroAddress, maxUint256 } from 'viem';
import { formatNumber, formatCurrency, safeFixed } from '@/utils/format';
import { dataApiUrl } from '@/core/sdk-config';
import { fetchTokenMetadataBatch } from '@/core/clients/metadata';
import TokenImage from '@/ui/shared/token-image';
import type { RankingItem, PoolStats, TokenMetadata } from '@/widgets/home/types';
import { SlippageSelector, HighImpactWarning, computeMinOut, DEFAULT_SLIPPAGE_BPS } from '@/widgets/trade/slippage-selector';
import { useDebouncedValue } from '@/hooks/ui/use-debounced-value';

const LAUNCHPAD_DEFAULT_DECIMALS = 6; // Safe fallback for Sidiora launchpad tokens only

interface TokenInfo {
  tokenAddress: string;
  poolAddress: string;
  name: string;
  symbol: string;
  logo: string | null;
  price: number;
  marketCap: number;
}

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
  tokens: TokenInfo[];
  balances: Record<string, bigint>;
  onSelect: (t: TokenInfo) => void;
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
    if (excludeAddress && t.tokenAddress.toLowerCase() === excludeAddress.toLowerCase()) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      t.tokenAddress.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[420px] mx-4 bg-dark-gray4 border border-dark-gray rounded-2xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="p-4 border-b border-dark-gray">
          <div className="flex items-center justify-between mb-3">
            <span className="text-size-14 font-manrope-bold text-white">Select a token</span>
            <button onClick={onClose} className="text-dark-disabled hover:text-white transition p-1">
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
            const bal = balances[token.tokenAddress.toLowerCase()];
            const balFmt = bal !== undefined ? parseFloat(formatUnits(bal, LAUNCHPAD_DEFAULT_DECIMALS)) : 0;
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
  readOnly,
  onSelectClick,
  onMaxClick,
}: {
  label: string;
  token: TokenInfo | null;
  amount: string;
  onAmountChange?: (v: string) => void;
  balance: bigint | null;
  readOnly?: boolean;
  onSelectClick: () => void;
  onMaxClick?: () => void;
}) {
  const balFmt = balance !== null ? parseFloat(formatUnits(balance, LAUNCHPAD_DEFAULT_DECIMALS)) : 0;
  const usdValue = token && amount && parseFloat(amount) > 0
    ? parseFloat(amount) * token.price
    : 0;
  const displayDigits = (amount || '0.00').split('');

  return (
    <div className="bg-dark-gray2 border border-dark-gray rounded-xl p-3.5 transition-all duration-200 hover:border-dark-gray6/60">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-size-10 text-dark-disabled uppercase tracking-wide">{label}</span>
        {balance !== null && (
          <div className="flex items-center gap-1.5">
            <span className="text-size-10 text-dark-disabled">Balance: {formatNumber(balFmt, 4)}</span>
            {onMaxClick && !readOnly && (
              <motion.button
                onClick={onMaxClick}
                whileTap={{ scale: 0.92 }}
                className="text-size-9 text-pink-middle hover:text-pink-middle2 font-manrope-bold transition"
              >
                <AnimatePresence mode="popLayout">
                  {amount && parseFloat(amount) > 0 && balFmt > 0 && parseFloat(amount) >= balFmt ? (
                    <motion.span key="using" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Using Max</motion.span>
                  ) : (
                    <motion.span key="use" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Use Max</motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 relative">
          <input
            type="number"
            value={amount}
            onChange={onAmountChange ? (e) => onAmountChange(e.target.value) : undefined}
            readOnly={readOnly}
            placeholder="0.00"
            className={`w-full bg-transparent text-size-16 font-manrope-bold text-transparent caret-white outline-none min-w-0 ${
              readOnly ? 'cursor-default opacity-70' : ''
            }`}
            min="0"
            step="any"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {displayDigits.map((digit, index) => (
                <motion.span
                  key={`${digit}-${index}`}
                  className={`text-size-16 font-manrope-bold ${
                    amount ? 'text-white' : 'text-dark-disabled'
                  }`}
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: '0%', opacity: 1 }}
                  exit={{ y: '-50%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                >
                  {digit}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <motion.button
          onClick={onSelectClick}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 bg-dark-gray7 hover:bg-dark-gray8 border border-dark-gray6/50 rounded-xl px-3 py-2 transition flex-shrink-0"
        >
          {token ? (
            <>
              <div className="relative w-6 h-6 rounded-full bg-dark-gray overflow-hidden flex-shrink-0 border border-dark-gray/70"
                style={{ filter: 'url(#SkiperSquiCircleFilterLayout)' }}>
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
        </motion.button>
      </div>
      <AnimatePresence mode="popLayout">
        {usdValue > 0 ? (
          <motion.div
            key="usd-value"
            className="mt-1"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          >
            <span className="text-size-10 text-dark-disabled">{formatCurrency(usdValue)}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Main Swap Panel ─────────────────────────────────────────────

export default function SwapPanel() {
  const { address, isConnected } = useAccount();

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokenIn, setTokenIn] = useState<TokenInfo | null>(null);
  const [tokenOut, setTokenOut] = useState<TokenInfo | null>(null);
  const [amountIn, setAmountIn] = useState('');
  const [selectorFor, setSelectorFor] = useState<'in' | 'out' | null>(null);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [showHighImpact, setShowHighImpact] = useState(false);

  // Fetch all tokens from ranking API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTokensLoading(true);
      try {
        const res = await fetch(dataApiUrl('/rankings/trending?limit=200&offset=0'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items: RankingItem[] = data.items ?? [];
        if (items.length === 0) { setTokensLoading(false); return; }

        const addrs = items.map((i) => i.poolAddress);
        const statsRes = await fetch(dataApiUrl(`/stats/batch?pools=${addrs.join(',')}`));
        let statsMap: Record<string, PoolStats> = {};
        if (statsRes.ok) statsMap = await statsRes.json();

        // ONE batch request via the metadata client (replaces N
        // parallel per-token fetches).
        const tokenAddrs = addrs.map(
          (poolAddr) => statsMap[poolAddr]?.tokenAddress || poolAddr,
        );
        const metaByToken = await fetchTokenMetadataBatch(tokenAddrs);

        if (cancelled) return;

        const list: TokenInfo[] = [];
        addrs.forEach((poolAddr, i) => {
          const stats = statsMap[poolAddr];
          const tokenAddr = tokenAddrs[i];
          const meta: TokenMetadata | null = metaByToken[tokenAddr.toLowerCase()] ?? null;
          if (!stats?.tokenAddress) return;
          const price = stats.price ? Number(stats.price) / 1e18 : 0;
          const mc = stats.marketCap ? Number(stats.marketCap) / 1e6 : 0;
          list.push({
            tokenAddress: stats.tokenAddress,
            poolAddress: poolAddr,
            name: meta?.name || `Token ${poolAddr.slice(0, 6)}`,
            symbol: meta?.symbol || '???',
            logo: meta?.images?.logo || null,
            price,
            marketCap: mc,
          });
        });
        setTokens(list);
      } catch (err) {
        console.error('Failed to load tokens for swap:', err);
      } finally {
        if (!cancelled) setTokensLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Balances ──────────────────────────────────────────────────
  const tokenInAddr = (tokenIn?.tokenAddress || zeroAddress) as `0x${string}`;
  const tokenOutAddr = (tokenOut?.tokenAddress || zeroAddress) as `0x${string}`;
  const userAddr = (address || zeroAddress) as `0x${string}`;

  // On-chain decimals reads (fallback to launchpad default)
  const { data: tokenInDecRaw } = useReadErc20Decimals({ token: tokenInAddr });
  const { data: tokenOutDecRaw } = useReadErc20Decimals({ token: tokenOutAddr });
  const tokenInDec = tokenInDecRaw !== undefined && tokenInDecRaw !== null
    ? Number(tokenInDecRaw) : LAUNCHPAD_DEFAULT_DECIMALS;
  const tokenOutDec = tokenOutDecRaw !== undefined && tokenOutDecRaw !== null
    ? Number(tokenOutDecRaw) : LAUNCHPAD_DEFAULT_DECIMALS;

  const { data: balInRaw, refetch: refetchBalIn } = useReadErc20Balance({ token: tokenInAddr, account: userAddr });
  const { data: balOutRaw, refetch: refetchBalOut } = useReadErc20Balance({ token: tokenOutAddr, account: userAddr });

  const balIn = balInRaw !== undefined && balInRaw !== null ? BigInt(String(balInRaw)) : null;
  const balOut = balOutRaw !== undefined && balOutRaw !== null ? BigInt(String(balOutRaw)) : null;

  // Build balances map for the selector (lazy — just what we know)
  const balances = useMemo(() => {
    const map: Record<string, bigint> = {};
    if (tokenIn && balIn !== null) map[tokenIn.tokenAddress.toLowerCase()] = balIn;
    if (tokenOut && balOut !== null) map[tokenOut.tokenAddress.toLowerCase()] = balOut;
    return map;
  }, [tokenIn, tokenOut, balIn, balOut]);

  // ── Allowance ─────────────────────────────────────────────────
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadErc20Allowance({
    token: tokenInAddr,
    owner: userAddr,
    spender: ROUTER_ADDRESS,
  });
  const allowance = allowanceRaw !== undefined && allowanceRaw !== null ? BigInt(String(allowanceRaw)) : null;

  // ── Quote ─────────────────────────────────────────────────────
  const hasAmount = amountIn !== '' && parseFloat(amountIn) > 0;
  const parsedAmountIn = hasAmount ? parseUnits(amountIn, tokenInDec) : 0n;
  const debouncedParsedAmountIn = useDebouncedValue(parsedAmountIn, 250);
  const debouncedHasAmount = debouncedParsedAmountIn > 0n;
  const canQuote = !!tokenIn && !!tokenOut && hasAmount && tokenIn.tokenAddress !== tokenOut.tokenAddress;

  const { data: quoteRaw, isLoading: quoteLoading } = useReadQuoterQuoteMultihop(
    {
      tokenIn: tokenInAddr,
      tokenOut: tokenOutAddr,
      amountIn: debouncedParsedAmountIn,
    },
    canQuote && debouncedHasAmount,
  );

  const quote = useMemo(() => {
    if (!canQuote || !quoteRaw) return null;
    const q = quoteRaw as any;
    try {
      // MultihopQuoteResult tuple or struct
      if (Array.isArray(q)) {
        return {
          amountOut: BigInt(q[0]),
          intermediateUsdl: BigInt(q[1]),
          sellFeeAmount: BigInt(q[2]),
          buyFeeAmount: BigInt(q[3]),
          sellPriceImpactBps: Number(q[4]),
          buyPriceImpactBps: Number(q[5]),
          combinedPriceImpactBps: Number(q[6]),
          poolA: String(q[7]),
          poolB: String(q[8]),
        };
      }
      return {
        amountOut: BigInt(q.amountOut ?? 0),
        intermediateUsdl: BigInt(q.intermediateUsdl ?? 0),
        sellFeeAmount: BigInt(q.sellFeeAmount ?? 0),
        buyFeeAmount: BigInt(q.buyFeeAmount ?? 0),
        sellPriceImpactBps: Number(q.sellPriceImpactBps ?? 0),
        buyPriceImpactBps: Number(q.buyPriceImpactBps ?? 0),
        combinedPriceImpactBps: Number(q.combinedPriceImpactBps ?? 0),
        poolA: String(q.poolA ?? ''),
        poolB: String(q.poolB ?? ''),
      };
    } catch {
      return null;
    }
  }, [quoteRaw, canQuote]);

  const estOut = quote ? parseFloat(formatUnits(quote.amountOut, tokenOutDec)) : null;
  const intermediateUsdl = quote ? parseFloat(formatUnits(quote.intermediateUsdl, 6)) : null; // USDL is always 6
  const totalFee = quote
    ? parseFloat(formatUnits(quote.sellFeeAmount + quote.buyFeeAmount, 6)) // fees in USDL
    : null;
  const combinedImpact = quote ? quote.combinedPriceImpactBps / 100 : null;

  // ── Approval state ────────────────────────────────────────────
  const needsApproval = hasAmount && allowance !== null && allowance < parsedAmountIn;
  const { write: writeApprove, isPending: approvePending, data: approveTxHash } = useWriteErc20Approve();
  const { receipt: approveReceipt } = useOptimisticReceipt(approveTxHash);
  const approveConfirming = approvePending || (!!approveTxHash && !approveReceipt);

  useEffect(() => {
    if (approveReceipt) refetchAllowance();
  }, [approveReceipt, refetchAllowance]);

  // ── Swap execution ────────────────────────────────────────────
  const { write: writeSwap, isPending: swapPending, data: swapTxHash } = useWriteRouterSwapTokenForToken();
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
  const isPending = swapPending || approveConfirming;

  const minAmountOut = useMemo(() => {
    if (!quote) return 0n;
    return computeMinOut(quote.amountOut, slippageBps);
  }, [quote, slippageBps]);

  const quoteUnavailable = canQuote && !quote;

  const executeSwap = () => {
    if (!canQuote || !isConnected || !quote) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    writeSwap({
      tokenIn: tokenInAddr,
      tokenOut: tokenOutAddr,
      amountIn: parsedAmountIn,
      minAmountOut,
      deadline,
    });
  };

  const handleSwap = () => {
    if (!canQuote || !isConnected) return;
    if (needsApproval) {
      writeApprove({ token: tokenInAddr, spender: ROUTER_ADDRESS, amount: parsedAmountIn });
      return;
    }
    if (!quote) return;
    if (quote.combinedPriceImpactBps > 500) {
      setShowHighImpact(true);
      return;
    }
    executeSwap();
  };

  // ── Side switcher ─────────────────────────────────────────────
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
    if (tokenIn.tokenAddress === tokenOut.tokenAddress) return 'Select different tokens';
    if (!hasAmount) return 'Enter an amount';
    if (insufficientBalance) return `Insufficient ${tokenIn.symbol} balance`;
    if (approveConfirming) return `Approving ${tokenIn.symbol}...`;
    if (swapPending) return 'Confirming swap...';
    if (needsApproval) return `Approve ${tokenIn.symbol}`;
    return 'Swap';
  })();

  const buttonDisabled =
    !isConnected || !canQuote || !hasAmount || isPending || insufficientBalance || quoteUnavailable;

  const effectiveRate =
    estOut !== null && parseFloat(amountIn) > 0
      ? estOut / parseFloat(amountIn)
      : null;

  return (
    <div className="w-full max-w-[460px] mx-auto">
      <div className="border border-dark-gray rounded-2xl bg-dark-gray4/80 backdrop-blur-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-size-16 font-manrope-bold text-white">Swap</h2>
          <div className="flex items-center gap-2">
          <SlippageSelector bps={slippageBps} onChange={setSlippageBps} />
          <div className="flex items-center gap-1.5 text-size-10 text-dark-disabled">
            <img src="/icons/ArrowsLeftRight.svg" alt="" width={14} height={14} className="opacity-60" />
            Token to Token
          </div>
          </div>
        </div>

        <div className="px-4 pb-4 space-y-1 relative">
          {/* Token In */}
          <TokenInputBox
            label="You pay"
            token={tokenIn}
            amount={amountIn}
            onAmountChange={setAmountIn}
            balance={isConnected ? balIn : null}
            onSelectClick={() => setSelectorFor('in')}
            onMaxClick={handleMaxIn}
          />

          {/* Flip button */}
          <div className="flex justify-center -my-3 relative z-10">
            <button
              onClick={handleFlip}
              className="w-10 h-10 rounded-xl bg-dark-gray7 border-2 border-dark-gray4/80 hover:bg-dark-gray8 transition flex items-center justify-center group"
              title="Switch tokens"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                className="text-half-enabled group-hover:text-white transition group-hover:rotate-180 duration-300"
              >
                <path d="M9 3V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M5 11L9 15L13 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Token Out */}
          <TokenInputBox
            label="You receive"
            token={tokenOut}
            amount={estOut !== null ? safeFixed(estOut, 4) : ''}
            balance={isConnected ? balOut : null}
            readOnly
            onSelectClick={() => setSelectorFor('out')}
          />

          {/* Quote details */}
          {canQuote && hasAmount && (
            <div className="border border-dark-gray rounded-xl p-3.5 mt-3 space-y-2 bg-dark-gray2/30">
              {quoteLoading && !quote && (
                <div className="text-size-11 text-dark-disabled text-center animate-pulse py-2">Fetching quote...</div>
              )}
              {quote && (
                <>
                  {/* Rate */}
                  {effectiveRate !== null && (
                    <div className="flex justify-between text-size-11">
                      <span className="text-dark-disabled">Rate</span>
                      <span className="text-white font-manrope-bold">
                        1 {tokenIn?.symbol} = {formatNumber(effectiveRate, 4)} {tokenOut?.symbol}
                      </span>
                    </div>
                  )}

                  {/* Intermediate USDL */}
                  {intermediateUsdl !== null && intermediateUsdl > 0 && (
                    <div className="flex justify-between text-size-11">
                      <span className="text-dark-disabled">Route via USDL</span>
                      <span className="text-half-enabled">{formatNumber(intermediateUsdl, 4)} USDL</span>
                    </div>
                  )}

                  {/* Price impact */}
                  <div className="flex justify-between text-size-11">
                    <span className="text-dark-disabled">Price impact</span>
                    <span className={`font-manrope-bold ${
                      combinedImpact !== null && combinedImpact > 5 ? 'text-red-middle' :
                      combinedImpact !== null && combinedImpact > 1 ? 'text-yellow-middle' : 'text-green-middle'
                    }`}>
                      {combinedImpact !== null ? `${safeFixed(combinedImpact, 2)}%` : '...'}
                    </span>
                  </div>

                  {/* Per-leg impacts */}
                  <div className="flex justify-between text-size-10">
                    <span className="text-dark-disabled pl-2">Sell leg</span>
                    <span className="text-dark-disabled">{safeFixed(Number(quote.sellPriceImpactBps) / 100, 2)}%</span>
                  </div>
                  <div className="flex justify-between text-size-10">
                    <span className="text-dark-disabled pl-2">Buy leg</span>
                    <span className="text-dark-disabled">{safeFixed(Number(quote.buyPriceImpactBps) / 100, 2)}%</span>
                  </div>

                  {/* Total fees */}
                  <div className="flex justify-between text-size-11 pt-1 border-t border-dark-gray/50">
                    <span className="text-dark-disabled">Total fees</span>
                    <span className="text-dark-disabled">
                      {totalFee !== null ? `${formatNumber(totalFee, 4)} USDL` : '...'}
                    </span>
                  </div>

                  {/* Min received (with slippage) */}
                  <div className="flex justify-between text-size-11">
                    <span className="text-dark-disabled">Min received ({safeFixed(Number(slippageBps) / 100, 1)}% slip)</span>
                    <span className="text-half-enabled font-manrope-bold">
                      {quote ? `${formatNumber(parseFloat(formatUnits(minAmountOut, tokenOutDec)), 4)} ${tokenOut?.symbol}` : '...'}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Insufficient balance warning */}
          <AnimatePresence>
            {insufficientBalance && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: [0, -4, 4, -3, 3, 0],
                }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  x: { delay: 0.1, times: [0, 0.2, 0.4, 0.6, 0.8, 1] },
                  type: 'spring', stiffness: 500, damping: 35,
                }}
                className="text-red-middle text-size-11 text-center py-1.5"
              >
                Insufficient {tokenIn?.symbol} balance
              </motion.div>
            )}
          </AnimatePresence>

          {/* Swap / Approve button */}
          <motion.button
            onClick={handleSwap}
            disabled={buttonDisabled}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`w-full py-3.5 rounded-xl text-size-14 font-manrope-bold transition mt-2 disabled:opacity-40 disabled:cursor-not-allowed ${
              insufficientBalance
                ? 'bg-red-middle/20 text-red-middle border border-red-middle/40'
                : needsApproval
                  ? 'bg-pink-middle/20 text-pink-middle border border-pink-middle/40 hover:bg-pink-middle/30'
                  : 'bg-green-middle text-black-gray hover:bg-green-middle2'
            }`}
          >
            <AnimatePresence mode="popLayout">
              <motion.span
                key={buttonLabel}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {buttonLabel}
              </motion.span>
            </AnimatePresence>
          </motion.button>

          {/* Swap success */}
          <AnimatePresence>
            {swapReceipt && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="text-green-middle text-size-11 text-center py-1"
              >
                Swap confirmed
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Loading state */}
      {tokensLoading && (
        <div className="text-center text-dark-disabled text-size-11 mt-4 animate-pulse">
          Loading tokens...
        </div>
      )}

      {/* High price impact confirmation */}
      {showHighImpact && quote && (
        <HighImpactWarning
          priceImpactBps={quote.combinedPriceImpactBps}
          onConfirm={() => { setShowHighImpact(false); executeSwap(); }}
          onCancel={() => setShowHighImpact(false)}
        />
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
