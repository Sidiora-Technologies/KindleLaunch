'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useOptimisticReceipt } from '@/hooks/tx/use-optimistic-receipt';
import { parseUnits, formatUnits, zeroAddress, maxUint256 } from 'viem';
import {
  useWriteRouterBuy,
  useWriteRouterSell,
  useReadQuoterQuoteExactInput,
  useReadQuoterGetPoolStats,
  useWriteErc20Approve,
  useReadErc20Allowance,
  useReadErc20Balance,
  useReadErc20Decimals,
  ROUTER_ADDRESS,
  USDL_ADDRESS,
} from '@/core/network/contracts';
import { sdkBaseUrls } from '@/core/sdk-config';
import { trackEvent } from '@/core/analytics';
import { reportError } from '@/core/report-error';
import { useDebouncedValue } from '@/hooks/ui/use-debounced-value';
import { useCardMinter } from '@/widgets/pnl/use-card-minter';
import { computeMinOut, DEFAULT_SLIPPAGE_BPS } from '@/widgets/trade/slippage-selector';
import type { TradeToastData } from './trade-toast';

export const LAUNCHPAD_DEFAULT_DECIMALS = 6;

interface PreTrade { isBuy: boolean; amount: string }

export interface UseTradePanelArgs { poolAddress: string }

export function useTradePanel({ poolAddress }: UseTradePanelArgs) {
  const { address, isConnected } = useAccount();
  const [isBuy, setIsBuy] = useState(true);
  const [amount, setAmount] = useState('');
  const [tokenName, setTokenName] = useState<string>('');
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [showHighImpact, setShowHighImpact] = useState(false);
  const [approveUnlimited, setApproveUnlimited] = useState(false);
  const [toastData, setToastData] = useState<TradeToastData | null>(null);
  const preTradeRef = useRef<PreTrade | null>(null);

  // ── Token metadata fetch ────────────────────────────────────
  useEffect(() => {
    if (!poolAddress) return;
    fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.tokenAddress) return;
        setTokenAddress(d.tokenAddress);
        return fetch(`${sdkBaseUrls.metadata}/metadata/${d.tokenAddress}.json`);
      })
      .then((r) => r && r.ok ? r.json() : null)
      .then((d) => { if (d?.symbol) setTokenName(d.symbol); else if (d?.name) setTokenName(d.name); })
      .catch((error) => { reportError(error, { area: 'trade-panel', action: 'fetchMetadata' }); });
  }, [poolAddress]);

  // ── Write hooks ──────────────────────────────────────────────
  const { write: writeBuy, isPending: buyPending, data: buyTxHash, reset: resetBuy } = useWriteRouterBuy();
  const { write: writeSell, isPending: sellPending, data: sellTxHash, reset: resetSell } = useWriteRouterSell();
  const { receipt: buyReceipt } = useOptimisticReceipt(buyTxHash);
  const { receipt: sellReceipt } = useOptimisticReceipt(sellTxHash);

  // ── PNL minter ───────────────────────────────────────────────
  const { mint: mintPnlCard, reset: resetPnlMint, state: mintState, card: mintedCard } = useCardMinter();
  const handleSharePnl = useCallback(() => {
    if (!address || !poolAddress) return;
    mintPnlCard({ ownerAddress: address, poolAddress });
  }, [address, poolAddress, mintPnlCard]);

  // Dismiss toast when modal mounts (modal becomes single focus)
  useEffect(() => {
    if (mintedCard) setToastData(null);
  }, [mintedCard]);

  // ── Approve ──────────────────────────────────────────────────
  const { write: writeApprove, isPending: approvePending, data: approveTxHash } = useWriteErc20Approve();
  const { receipt: approveReceipt } = useOptimisticReceipt(approveTxHash);

  // ── USDL reads ───────────────────────────────────────────────
  const { data: usdlAllowance, refetch: refetchAllowance } = useReadErc20Allowance({
    token: USDL_ADDRESS,
    owner: (address || zeroAddress) as `0x${string}`,
    spender: ROUTER_ADDRESS,
  });
  const { data: usdlBalanceRaw, refetch: refetchUsdlBalance } = useReadErc20Balance({
    token: USDL_ADDRESS,
    account: (address || zeroAddress) as `0x${string}`,
  });
  const { data: usdlDecimalsRaw } = useReadErc20Decimals({ token: USDL_ADDRESS });
  const usdlDecimals = usdlDecimalsRaw !== undefined && usdlDecimalsRaw !== null ? Number(usdlDecimalsRaw) : 6;

  // ── Pool token reads ─────────────────────────────────────────
  const poolTokenAddr = (tokenAddress || zeroAddress) as `0x${string}`;
  const { data: tokenDecimalsRaw } = useReadErc20Decimals({ token: poolTokenAddr });
  const tokenDecimals = tokenDecimalsRaw !== undefined && tokenDecimalsRaw !== null
    ? Number(tokenDecimalsRaw)
    : LAUNCHPAD_DEFAULT_DECIMALS;
  const { data: tokenBalanceRaw, refetch: refetchTokenBalance } = useReadErc20Balance({
    token: poolTokenAddr,
    account: (address || zeroAddress) as `0x${string}`,
  });
  const { data: tokenAllowanceRaw, refetch: refetchTokenAllowance } = useReadErc20Allowance({
    token: poolTokenAddr,
    owner: (address || zeroAddress) as `0x${string}`,
    spender: ROUTER_ADDRESS,
  });

  // ── Pool stats (on-chain) ────────────────────────────────────
  const pool = poolAddress as `0x${string}`;
  const { data: poolStatsRaw } = useReadQuoterGetPoolStats({ pool });

  const poolStats = useMemo(() => {
    if (!poolStatsRaw) return null;
    const s = poolStatsRaw as any;
    if (Array.isArray(s)) {
      return { currentFeeBps: Number(s[4]), marketCap: s[6], price: s[7] };
    }
    return {
      currentFeeBps: Number(s.currentFeeBps ?? 0),
      marketCap: s.marketCap,
      price: s.price,
    };
  }, [poolStatsRaw]);

  // ── Derived balances ─────────────────────────────────────────
  const usdlBalance = usdlBalanceRaw !== undefined && usdlBalanceRaw !== null ? BigInt(String(usdlBalanceRaw)) : null;
  const tokenBalance = tokenBalanceRaw !== undefined && tokenBalanceRaw !== null ? BigInt(String(tokenBalanceRaw)) : null;
  const usdlBalFmt = usdlBalance !== null ? parseFloat(formatUnits(usdlBalance, usdlDecimals)) : 0;
  const tokenBalFmt = tokenBalance !== null ? parseFloat(formatUnits(tokenBalance, tokenDecimals)) : 0;

  // ── Approval refresh after on-chain confirm ──────────────────
  useEffect(() => {
    if (approveReceipt) {
      refetchAllowance();
      refetchTokenAllowance();
    }
  }, [approveReceipt, refetchAllowance, refetchTokenAllowance]);

  // ── Amount + quote ───────────────────────────────────────────
  const hasAmount = amount !== '' && parseFloat(amount) > 0;
  const inputDecimals = isBuy ? usdlDecimals : tokenDecimals;
  const outputDecimals = isBuy ? tokenDecimals : usdlDecimals;
  const parsedAmount = hasAmount ? parseUnits(amount, inputDecimals) : 0n;

  const debouncedParsedAmount = useDebouncedValue(parsedAmount, 250);
  const debouncedHasAmount = debouncedParsedAmount > 0n;

  const tokenAllowance = tokenAllowanceRaw !== undefined && tokenAllowanceRaw !== null
    ? BigInt(String(tokenAllowanceRaw)) : null;

  const needsApproval = hasAmount
    ? isBuy
      ? (usdlAllowance === undefined || usdlAllowance === null || BigInt(String(usdlAllowance)) < parsedAmount)
      : (tokenAllowance === null || tokenAllowance < parsedAmount)
    : false;
  const approveConfirming = approvePending || (!!approveTxHash && !approveReceipt);

  const activeBalance = isBuy ? usdlBalance : tokenBalance;
  const insufficientBalance = hasAmount && activeBalance !== null && activeBalance < parsedAmount;

  const { data: quoteRaw } = useReadQuoterQuoteExactInput(
    debouncedHasAmount ? { pool, amountIn: debouncedParsedAmount, isBuy } : { pool, amountIn: 0n, isBuy: true },
  );

  const quote = useMemo(() => {
    if (!hasAmount || !quoteRaw) return null;
    const q = quoteRaw as any;
    try {
      if (Array.isArray(q)) {
        return {
          amountOut: BigInt(q[0]),
          feeAmount: BigInt(q[1]),
          priceImpactBps: Number(q[2]),
        };
      }
      return {
        amountOut: BigInt(q.amountOut ?? q[0] ?? 0),
        feeAmount: BigInt(q.feeAmount ?? q[1] ?? 0),
        priceImpactBps: Number(q.priceImpactBps ?? q[2] ?? 0),
      };
    } catch { return null; }
  }, [quoteRaw, hasAmount]);

  const estOutput = quote ? parseFloat(formatUnits(quote.amountOut, outputDecimals)) : null;
  const feeAmt = quote ? parseFloat(formatUnits(quote.feeAmount, isBuy ? usdlDecimals : tokenDecimals)) : null;
  const priceImpact = quote ? quote.priceImpactBps / 100 : null;
  const feePercent = poolStats ? poolStats.currentFeeBps / 100 : null;

  const minOut = useMemo(() => {
    if (!quote) return 0n;
    return computeMinOut(quote.amountOut, slippageBps);
  }, [quote, slippageBps]);

  const quoteUnavailable = hasAmount && !quote;

  // ── Trade execution ──────────────────────────────────────────
  const executeTrade = useCallback(() => {
    if (!hasAmount || !isConnected || !quote) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    preTradeRef.current = { isBuy, amount };
    if (isBuy) {
      writeBuy({ pool, usdlAmountIn: parsedAmount, minTokensOut: minOut, deadline });
    } else {
      writeSell({ pool, tokenAmountIn: parsedAmount, minUsdlOut: minOut, deadline });
    }
  }, [hasAmount, isConnected, quote, isBuy, amount, pool, parsedAmount, minOut, writeBuy, writeSell]);

  const handleTrade = useCallback(() => {
    if (!hasAmount || !isConnected) return;
    if (needsApproval) {
      const approveToken = isBuy ? USDL_ADDRESS : poolTokenAddr;
      const approvalAmount = approveUnlimited ? maxUint256 : parsedAmount;
      writeApprove({ token: approveToken, spender: ROUTER_ADDRESS, amount: approvalAmount });
      trackEvent('approval_submitted', { unlimited: approveUnlimited });
      return;
    }
    if (!quote) return;
    if (quote.priceImpactBps > 500) {
      setShowHighImpact(true);
      return;
    }
    executeTrade();
  }, [hasAmount, isConnected, needsApproval, isBuy, poolTokenAddr, approveUnlimited, parsedAmount, writeApprove, quote, executeTrade]);

  // ── Tx confirmation toast ────────────────────────────────────
  const showConfirmation = useCallback(async (receipt: any, type: 'buy' | 'sell') => {
    const pre = preTradeRef.current;
    if (!pre) return;
    if (!receipt._optimistic && receipt.status === 'reverted') {
      setToastData({
        type,
        inputAmount: parseFloat(pre.amount) || 0,
        inputSymbol: type === 'buy' ? 'USDL' : (tokenName || 'Token'),
        outputAmount: 0,
        outputSymbol: type === 'buy' ? (tokenName || 'Token') : 'USDL',
        newUsdlBalance: 0,
        newTokenBalance: 0,
        tokenName: tokenName || 'Token',
        txHash: receipt.transactionHash || '',
        reverted: true,
      } as TradeToastData & { reverted?: boolean });
      trackEvent('trade_failed', { reason: 'reverted', txHash: receipt.transactionHash });
      preTradeRef.current = null;
      if (type === 'buy') resetBuy(); else resetSell();
      return;
    }
    const [usdlRes, tokenRes] = await Promise.all([
      refetchUsdlBalance(),
      refetchTokenBalance(),
    ]);
    const newUsdl = usdlRes.data !== undefined && usdlRes.data !== null
      ? parseFloat(formatUnits(BigInt(String(usdlRes.data)), usdlDecimals)) : 0;
    const newToken = tokenRes.data !== undefined && tokenRes.data !== null
      ? parseFloat(formatUnits(BigInt(String(tokenRes.data)), tokenDecimals)) : 0;
    setToastData({
      type,
      inputAmount: parseFloat(pre.amount) || 0,
      inputSymbol: type === 'buy' ? 'USDL' : (tokenName || 'Token'),
      outputAmount: estOutput ?? 0,
      outputSymbol: type === 'buy' ? (tokenName || 'Token') : 'USDL',
      newUsdlBalance: newUsdl,
      newTokenBalance: newToken,
      tokenName: tokenName || 'Token',
      txHash: receipt.transactionHash || '',
    });
    setAmount('');
    preTradeRef.current = null;
    if (type === 'buy') resetBuy(); else resetSell();
  }, [usdlDecimals, tokenDecimals, tokenName, estOutput, refetchUsdlBalance, refetchTokenBalance, resetBuy, resetSell]);

  useEffect(() => {
    if (buyReceipt) showConfirmation(buyReceipt, 'buy');
  }, [buyReceipt, showConfirmation]);

  useEffect(() => {
    if (sellReceipt) showConfirmation(sellReceipt, 'sell');
  }, [sellReceipt, showConfirmation]);

  const switchMode = useCallback((buy: boolean) => {
    setIsBuy(buy);
    setAmount('');
  }, []);

  const handleSellPct = useCallback((pct: number) => {
    if (tokenBalance === null) return;
    const portion = (tokenBalance * BigInt(pct)) / 100n;
    setAmount(formatUnits(portion, tokenDecimals));
  }, [tokenBalance, tokenDecimals]);

  const handleMax = useCallback(() => {
    if (isBuy && usdlBalance !== null) setAmount(formatUnits(usdlBalance, usdlDecimals));
    if (!isBuy && tokenBalance !== null) setAmount(formatUnits(tokenBalance, tokenDecimals));
  }, [isBuy, usdlBalance, tokenBalance, usdlDecimals, tokenDecimals]);

  const isPending = buyPending || sellPending || approveConfirming;

  return {
    // state
    isBuy, amount, setAmount, switchMode,
    tokenName, tokenAddress, slippageBps, setSlippageBps,
    approveUnlimited, setApproveUnlimited,
    showHighImpact, setShowHighImpact,
    // wallet
    address, isConnected,
    // balances
    usdlBalance, tokenBalance, usdlBalFmt, tokenBalFmt,
    usdlDecimals, tokenDecimals, inputDecimals,
    // amount + quote
    hasAmount, parsedAmount, quote, estOutput, feeAmt, priceImpact, feePercent, poolStats,
    // approval
    needsApproval, approveConfirming,
    insufficientBalance: !!insufficientBalance,
    quoteUnavailable, isPending,
    buyPending, sellPending,
    // actions
    handleTrade, executeTrade, handleSellPct, handleMax, handleSharePnl,
    // toast / pnl
    toastData, setToastData, mintState, mintedCard, resetPnlMint,
  };
}
