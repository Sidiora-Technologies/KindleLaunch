'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import {
  useWriteRouterBuy,
  useWriteErc20Approve,
  useReadErc20Allowance,
  ROUTER_ADDRESS,
  USDL_ADDRESS,
} from '@/core/network/contracts';
import { parseUnits, maxUint256 } from 'viem';
import { toast } from 'sonner';

const QUICK_AMOUNTS = [
  { label: '1', value: '1' },
  { label: '5', value: '5' },
  { label: '10', value: '10' },
  { label: '25', value: '25' },
];

interface QuickBuyButtonProps {
  poolAddress: string;
  tokenSymbol?: string;
}

export default function QuickBuyButton({ poolAddress, tokenSymbol }: QuickBuyButtonProps) {
  const [expanded, setExpanded] = useState(false);
  const [buying, setBuying] = useState(false);
  const { address, isConnected } = useAccount();

  const { write: writeBuy } = useWriteRouterBuy();
  const { write: writeApprove } = useWriteErc20Approve();

  const { data: allowance } = useReadErc20Allowance({
    token: USDL_ADDRESS,
    owner: (address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    spender: ROUTER_ADDRESS,
  });

  const handleQuickBuy = useCallback(async (amount: string) => {
    if (!isConnected || !address) {
      toast.error('Connect your wallet first');
      return;
    }

    setBuying(true);
    try {
      const usdlAmount = parseUnits(amount, 6);

      if (!allowance || allowance < usdlAmount) {
        toast.info('Approving USDL...');
        writeApprove({
          token: USDL_ADDRESS,
          spender: ROUTER_ADDRESS,
          amount: maxUint256,
        });
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      writeBuy({
        pool: poolAddress as `0x${string}`,
        usdlAmountIn: usdlAmount,
        minTokensOut: 0n,
        deadline,
      });

      toast.success(`Buying ${tokenSymbol || 'tokens'} with ${amount} USDL`);
      setExpanded(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      if (!message.includes('rejected')) {
        toast.error(message.length > 60 ? message.slice(0, 57) + '...' : message);
      }
    } finally {
      setBuying(false);
    }
  }, [isConnected, address, allowance, writeApprove, writeBuy, poolAddress, tokenSymbol]);

  return (
    <div className="relative" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setExpanded(!expanded)}
        disabled={buying}
        className="flex items-center gap-1.5 px-3 py-2 sm:px-2 sm:py-1 rounded-xl sm:rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-size-13 sm:text-size-10 font-manrope-bold hover:bg-emerald-500/25 active:bg-emerald-500/30 transition-all disabled:opacity-50 min-h-[36px] sm:min-h-0"
      >
        {buying ? (
          <span className="w-4 h-4 sm:w-3 sm:h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 10 10" fill="none" className="sm:w-[10px] sm:h-[10px]">
            <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        Buy
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute right-0 top-full mt-1.5 z-50 flex gap-1.5 sm:gap-1 p-1.5 sm:p-1 rounded-xl sm:rounded-lg bg-black-gray border border-dark-gray shadow-2xl"
          >
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt.value}
                onClick={() => handleQuickBuy(amt.value)}
                disabled={buying}
                className="px-3 py-2 sm:px-2 sm:py-1 rounded-lg sm:rounded-md text-size-13 sm:text-size-10 font-manrope-bold text-half-enabled hover:text-white hover:bg-dark-gray2 active:bg-dark-gray2 transition whitespace-nowrap disabled:opacity-50 min-h-[36px] sm:min-h-0 min-w-[44px] sm:min-w-0"
              >
                ${amt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
