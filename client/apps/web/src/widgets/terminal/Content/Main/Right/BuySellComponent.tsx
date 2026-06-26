'use client';

import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from "next/image";
import { useAccount } from 'wagmi';
import { useOptimisticReceipt } from '@/hooks/tx/use-optimistic-receipt';
import {
  useWriteRouterBuy,
  useWriteRouterSell,
  useWriteErc20Approve,
  useReadErc20Allowance,
  useReadErc20Balance,
  useReadErc20Decimals,
  useReadQuoterQuoteExactInput,
  ROUTER_ADDRESS,
  USDL_ADDRESS,
} from '@/core/network/contracts';
import { parseUnits, formatUnits, zeroAddress, maxUint256 } from 'viem';
import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatCurrency, formatNumber, safeFixed } from '@/utils/format';
import { SlippageSelector, HighImpactWarning, computeMinOut, DEFAULT_SLIPPAGE_BPS } from '@/widgets/trade/slippage-selector';

import walletImg from "@/assets/icons/wallet_svgrepo.com.svg";

const BUY_PRESETS = ['10', '50', '100', '500'] as const;
const SELL_PCTS = [25, 50, 75, 100] as const;
const TOKEN_DECIMALS = 6;

const BuySellComponent = () => {
    const selectedPool = useTerminalStore((s) => s.selectedPool);
    const metadata = useTerminalStore((s) => s.metadata);
    const stats = useTerminalStore((s) => s.stats);
    const { address, isConnected } = useAccount();
    const [isBuy, setIsBuy] = useState(true);
    const [amount, setAmount] = useState('');
    const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
    const [showHighImpact, setShowHighImpact] = useState(false);

    const pool = (selectedPool || zeroAddress) as `0x${string}`;
    const tokenAddress = stats?.tokenAddress || null;
    const poolTokenAddr = (tokenAddress || zeroAddress) as `0x${string}`;
    const hasAmount = amount !== '' && parseFloat(amount) > 0;

    const { write: writeBuy, isPending: buyPending } = useWriteRouterBuy();
    const { write: writeSell, isPending: sellPending } = useWriteRouterSell();
    const { write: writeApprove, isPending: approvePending, data: approveTxHash } = useWriteErc20Approve();
    const { receipt: approveReceipt } = useOptimisticReceipt(approveTxHash);

    // USDL reads
    const { data: usdlAllowance, refetch: refetchUsdlAllowance } = useReadErc20Allowance({
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

    // Pool token reads
    const { data: tokenBalanceRaw, refetch: refetchTokenBalance } = useReadErc20Balance({
        token: poolTokenAddr,
        account: (address || zeroAddress) as `0x${string}`,
    });
    const { data: tokenAllowanceRaw, refetch: refetchTokenAllowance } = useReadErc20Allowance({
        token: poolTokenAddr,
        owner: (address || zeroAddress) as `0x${string}`,
        spender: ROUTER_ADDRESS,
    });

    // Refetch allowances on approve receipt
    useEffect(() => {
        if (approveReceipt) {
            refetchUsdlAllowance();
            refetchTokenAllowance();
        }
    }, [approveReceipt, refetchUsdlAllowance, refetchTokenAllowance]);

    // Derived balances
    const usdlBalance = usdlBalanceRaw !== undefined && usdlBalanceRaw !== null ? BigInt(String(usdlBalanceRaw)) : null;
    const tokenBalance = tokenBalanceRaw !== undefined && tokenBalanceRaw !== null ? BigInt(String(tokenBalanceRaw)) : null;
    const usdlBalFmt = usdlBalance !== null ? parseFloat(formatUnits(usdlBalance, usdlDecimals)) : 0;
    const tokenBalFmt = tokenBalance !== null ? parseFloat(formatUnits(tokenBalance, TOKEN_DECIMALS)) : 0;

    // Approval logic — checks correct token per mode
    const inputDecimals = isBuy ? usdlDecimals : TOKEN_DECIMALS;
    const parsedAmount = hasAmount ? parseUnits(amount, inputDecimals) : 0n;
    const tokenAllowance = tokenAllowanceRaw !== undefined && tokenAllowanceRaw !== null ? BigInt(String(tokenAllowanceRaw)) : null;

    const needsApproval = hasAmount
        ? isBuy
            ? (usdlAllowance === undefined || usdlAllowance === null || BigInt(String(usdlAllowance)) < parsedAmount)
            : (tokenAllowance === null || tokenAllowance < parsedAmount)
        : false;
    const approveConfirming = approvePending || (!!approveTxHash && !approveReceipt);

    const activeBalance = isBuy ? usdlBalance : tokenBalance;
    const insufficientBalance = hasAmount && activeBalance !== null && activeBalance < parsedAmount;

    // Quoter
    const outputDecimals = isBuy ? TOKEN_DECIMALS : usdlDecimals;
    const { data: quoteRaw } = useReadQuoterQuoteExactInput(
        hasAmount && selectedPool
            ? { pool, amountIn: parsedAmount, isBuy }
            : { pool, amountIn: 0n, isBuy: true },
    );

    const quote = useMemo(() => {
        if (!hasAmount || !quoteRaw) return null;
        const q = quoteRaw as any;
        try {
            if (Array.isArray(q)) {
                return { amountOut: BigInt(q[0]), feeAmount: BigInt(q[1]), priceImpactBps: Number(q[2]) };
            }
            return {
                amountOut: BigInt(q.amountOut ?? q[0] ?? 0),
                feeAmount: BigInt(q.feeAmount ?? q[1] ?? 0),
                priceImpactBps: Number(q.priceImpactBps ?? q[2] ?? 0),
            };
        } catch { return null; }
    }, [quoteRaw, hasAmount]);

    const estOutput = quote ? parseFloat(formatUnits(quote.amountOut, outputDecimals)) : null;
    const feeAmt = quote ? parseFloat(formatUnits(quote.feeAmount, isBuy ? usdlDecimals : TOKEN_DECIMALS)) : null;
    const priceImpact = quote ? quote.priceImpactBps / 100 : null;

    const minOut = useMemo(() => {
        if (!quote) return 0n;
        return computeMinOut(quote.amountOut, slippageBps);
    }, [quote, slippageBps]);

    const quoteUnavailable = hasAmount && !quote;

    const executeTrade = () => {
        if (!hasAmount || !isConnected || !selectedPool || !quote) return;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
        if (isBuy) {
            writeBuy({ pool, usdlAmountIn: parsedAmount, minTokensOut: minOut, deadline });
        } else {
            writeSell({ pool, tokenAmountIn: parsedAmount, minUsdlOut: minOut, deadline });
        }
    };

    const handleTrade = () => {
        if (!hasAmount || !isConnected || !selectedPool) return;
        if (needsApproval) {
            const approveToken = isBuy ? USDL_ADDRESS : poolTokenAddr;
            writeApprove({ token: approveToken, spender: ROUTER_ADDRESS, amount: parsedAmount });
            return;
        }
        if (!quote) return;
        if (quote.priceImpactBps > 500) {
            setShowHighImpact(true);
            return;
        }
        executeTrade();
    };

    const switchMode = (buy: boolean) => {
        setIsBuy(buy);
        setAmount('');
        refetchUsdlBalance();
        refetchTokenBalance();
    };

    const handleSellPct = (pct: number) => {
        if (tokenBalance === null) return;
        const portion = (tokenBalance * BigInt(pct)) / 100n;
        setAmount(formatUnits(portion, TOKEN_DECIMALS));
    };

    const isPending = buyPending || sellPending || approveConfirming;
    const tokenSymbol = metadata?.symbol || 'Token';

    return (<>
        <div className="rounded-md border-dark-gray border-1">
            <div className="border-b-1 border-dark-gray p-3">
                <div className="flex justify-around items-center bg-gradient-black-gray rounded-md border-dark-gray border-1">
                    <button
                        onClick={() => switchMode(true)}
                        className={`w-full -my-px rounded-md text-size-12 font-manrope-extra-bold py-2 transition ${
                            isBuy ? 'bg-green-opacity-005 border-1 border-green-middle4 text-white' : 'text-dark-disabled hover:text-gray-300'
                        }`}
                    >Buy</button>
                    <button
                        onClick={() => switchMode(false)}
                        className={`w-full -my-px rounded-md text-size-12 font-manrope-extra-bold py-2 transition ${
                            !isBuy ? 'bg-red-opacity-005 border-1 border-red-middle text-white' : 'text-dark-disabled hover:text-gray-300'
                        }`}
                    >Sell</button>
                </div>
            </div>

            <div className="border-b-1 border-dark-gray flex justify-between items-center py-1">
                <span className="text-size-11 text-dark-disabled px-3">Market Order</span>
                <SlippageSelector bps={slippageBps} onChange={setSlippageBps} />
                {isConnected && (
                    <div className="min-w-15 flex justify-between border-1 rounded-2xl border-dark-gray px-2 bg-gradient-black-gray mx-3">
                        <div className="flex justify-center items-center mr-1">
                            <Image src={walletImg} alt="wallet" className="mx-0.5" />
                            <span className="font-manrope-bold text-size-9 pt-0.5 text-half-enabled">
                                {isBuy
                                    ? `${formatCurrency(usdlBalFmt)}`
                                    : `${formatNumber(tokenBalFmt, 2)} ${tokenSymbol}`
                                }
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-3 flex flex-col gap-2 text-size-11 text-dark-disabled">
                <div className="border-1 border-dark-gray rounded-md flex">
                    <div className="border-r-1 border-dark-gray w-[30%] py-2 flex justify-center items-center rounded-l-md bg-dark-gray4">
                        {isBuy ? 'USDL' : tokenSymbol}
                    </div>
                    <div className="bg-gradient-black-gray w-[70%] rounded-r-md px-3 flex justify-between items-center">
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="bg-transparent w-full text-white text-size-12 outline-none py-2"
                            min="0"
                            step="any"
                        />
                    </div>
                </div>

                {isBuy ? (
                    <div className="flex justify-between items-center gap-1">
                        {BUY_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                onClick={() => setAmount(preset)}
                                className={`flex-1 py-1.5 rounded-md border text-size-10 font-manrope-bold transition ${
                                    amount === preset
                                        ? 'border-green-middle/60 text-green-middle bg-green-opacity-005'
                                        : 'border-dark-gray text-dark-disabled hover:text-half-enabled'
                                }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex justify-between items-center gap-1">
                        {SELL_PCTS.map((pct) => (
                            <button
                                key={pct}
                                onClick={() => handleSellPct(pct)}
                                className={`flex-1 py-1.5 rounded-md border text-size-10 font-manrope-bold transition ${
                                    tokenBalance !== null && amount === formatUnits((tokenBalance * BigInt(pct)) / 100n, TOKEN_DECIMALS)
                                        ? 'border-red-middle/60 text-red-middle bg-red-opacity-015'
                                        : 'border-dark-gray text-dark-disabled hover:text-half-enabled'
                                }`}
                            >
                                {pct}%
                            </button>
                        ))}
                    </div>
                )}

                {hasAmount && estOutput !== null && (
                    <div className="border-1 border-dark-gray rounded-md p-2 bg-gradient-black-gray text-size-10 space-y-1">
                        <div className="flex justify-between">
                            <span className="text-dark-disabled">{isBuy ? `Est. ${tokenSymbol}` : 'Est. USDL'}</span>
                            <span className="text-white font-manrope-bold">{formatNumber(estOutput, 4)}</span>
                        </div>
                        {priceImpact !== null && (
                            <div className="flex justify-between">
                                <span className="text-dark-disabled">Price impact</span>
                                <span className={`font-manrope-bold ${
                                    priceImpact > 5 ? 'text-red-middle' : priceImpact > 1 ? 'text-yellow-middle' : 'text-green-middle'
                                }`}>{safeFixed(priceImpact, 2)}%</span>
                            </div>
                        )}
                        {feeAmt !== null && (
                            <div className="flex justify-between">
                                <span className="text-dark-disabled">Fee</span>
                                <span className="text-dark-disabled">{formatNumber(feeAmt, 4)} {isBuy ? 'USDL' : tokenSymbol}</span>
                            </div>
                        )}
                    </div>
                )}

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
                      className="text-red-middle text-size-10 text-center"
                    >
                        Insufficient {isBuy ? 'USDL' : tokenSymbol} balance
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                    onClick={handleTrade}
                    disabled={!isConnected || !hasAmount || isPending || insufficientBalance || !selectedPool || quoteUnavailable}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={`w-full py-2.5 rounded-md text-size-13 font-manrope-extra-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        isBuy
                            ? 'bg-linear-to-r from-green-from to-green-to border border-green-border text-white hover:brightness-105'
                            : 'bg-red-middle text-white hover:bg-red-middle3'
                    }`}
                >
                    {!selectedPool
                        ? 'Select a token'
                        : !isConnected
                            ? 'Connect Wallet'
                            : insufficientBalance
                                ? `Insufficient ${isBuy ? 'USDL' : tokenSymbol} Balance`
                                : approveConfirming
                                    ? `Approving ${isBuy ? 'USDL' : tokenSymbol}...`
                                    : isPending
                                        ? 'Confirming...'
                                        : needsApproval
                                            ? `Approve ${isBuy ? 'USDL' : tokenSymbol}`
                                            : isBuy ? `Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`
                    }
                </motion.button>
            </div>
        </div>

        {showHighImpact && quote && (
            <HighImpactWarning
                priceImpactBps={quote.priceImpactBps}
                onConfirm={() => { setShowHighImpact(false); executeTrade(); }}
                onCancel={() => setShowHighImpact(false)}
            />
        )}
    </>);
  };
  
  export default BuySellComponent;