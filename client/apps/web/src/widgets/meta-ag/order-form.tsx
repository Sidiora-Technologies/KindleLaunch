'use client';

/**
 * OrderForm — Limit / Stop / Stop-Limit order placement against PECOROrders.
 *
 * Pricing is in 18-decimal USD (PriceOracle.PRICE_DECIMALS = 18).
 * Token amounts use the underlying ERC20 decimals (read on-chain).
 *
 * Approval flow:
 *   - Buy variants pull `stablecoinAmount` of the stablecoin → user approves
 *     PECOROrders for USDL.
 *   - Sell / stop-loss variants pull `tokenAmount` of the token → user
 *     approves PECOROrders for that token.
 *
 * Expiry: defaults to 7 days; user can pick 1d/1w/1mo/never (never = uint64 max).
 */
import { useState, useMemo, useEffect } from 'react';
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
  PECOR_ORDERS_ADDRESS,
  META_AG_USDL_ADDRESS,
  META_AG_PRICE_DECIMALS,
  useReadMetaAGQuoterGetTokenPrice,
  useWritePecorOrdersPlaceLimitBuy,
  useWritePecorOrdersPlaceLimitSell,
  useWritePecorOrdersPlaceStopLoss,
  useWritePecorOrdersPlaceStopLimitBuy,
  useWritePecorOrdersPlaceStopLimitSell,
} from '@/core/clients/meta-ag';
import { formatNumber, formatCurrency } from '@/utils/format';
import TokenImage from '@/ui/shared/token-image';
import {
  loadMetaAgTokens,
  type MetaAgToken,
} from './token-universe';

type OrderKind = 'limit-buy' | 'limit-sell' | 'stop-loss' | 'stop-limit-buy' | 'stop-limit-sell';

const ORDER_TABS: { id: OrderKind; label: string }[] = [
  { id: 'limit-buy', label: 'Limit Buy' },
  { id: 'limit-sell', label: 'Limit Sell' },
  { id: 'stop-loss', label: 'Stop Loss' },
  { id: 'stop-limit-buy', label: 'Stop-Limit Buy' },
  { id: 'stop-limit-sell', label: 'Stop-Limit Sell' },
];

const EXPIRY_OPTIONS: { id: string; label: string; seconds: number | 'never' }[] = [
  { id: '1d', label: '1 day', seconds: 24 * 3600 },
  { id: '7d', label: '7 days', seconds: 7 * 24 * 3600 },
  { id: '30d', label: '30 days', seconds: 30 * 24 * 3600 },
  { id: 'never', label: 'GTC', seconds: 'never' },
];

// Pretty USD price input parser. Returns 18-dec bigint or null on parse fail.
function parsePriceUsd(value: string): bigint | null {
  if (!value) return null;
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  try {
    return parseUnits(value, META_AG_PRICE_DECIMALS);
  } catch {
    return null;
  }
}

// Format an 18-dec USD price for display.
function formatPriceUsd(p: bigint): number {
  return parseFloat(formatUnits(p, META_AG_PRICE_DECIMALS));
}

export interface OrderFormProps {
  onPlaced?: () => void;
}

export default function OrderForm({ onPlaced }: OrderFormProps) {
  const { address, isConnected } = useAccount();
  const userAddr = (address || zeroAddress) as `0x${string}`;

  const [kind, setKind] = useState<OrderKind>('limit-buy');
  const [tokens, setTokens] = useState<MetaAgToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [token, setToken] = useState<MetaAgToken | null>(null);
  const [amount, setAmount] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [expiryId, setExpiryId] = useState<string>('7d');
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');

  // Tokens — exclude USDL (it's the implicit stablecoin pair).
  useEffect(() => {
    const ctrl = new AbortController();
    setTokensLoading(true);
    loadMetaAgTokens(ctrl.signal)
      .then((list) => {
        const filtered = list.filter(
          (t) => t.tokenAddress !== META_AG_USDL_ADDRESS.toLowerCase(),
        );
        setTokens(filtered);
        if (filtered.length > 0 && !token) setToken(filtered[0]);
      })
      .finally(() => setTokensLoading(false));
    return () => ctrl.abort();
  }, [token]);

  const tokenAddr = (token?.tokenAddress || zeroAddress) as `0x${string}`;
  const isBuyKind = kind === 'limit-buy' || kind === 'stop-limit-buy';
  const isStopKind = kind === 'stop-loss' || kind === 'stop-limit-buy' || kind === 'stop-limit-sell';

  // Decimal lookups for amount field.
  const { data: tokenDecRaw } = useReadErc20Decimals({ token: tokenAddr });
  const { data: usdlDecRaw } = useReadErc20Decimals({ token: META_AG_USDL_ADDRESS });
  const tokenDec = tokenDecRaw !== undefined && tokenDecRaw !== null
    ? Number(tokenDecRaw)
    : token?.decimals ?? 6;
  const usdlDec = usdlDecRaw !== undefined && usdlDecRaw !== null
    ? Number(usdlDecRaw)
    : 18;

  // Active token to deposit (and approve): USDL for buy, the token for sell/stop-loss.
  const depositToken = isBuyKind ? META_AG_USDL_ADDRESS : tokenAddr;
  const depositDec = isBuyKind ? usdlDec : tokenDec;
  const depositSymbol = isBuyKind ? 'USDL' : (token?.symbol ?? 'Token');

  // Balances & allowance vs PECOROrders
  const { data: balRaw, refetch: refetchBalance } = useReadErc20Balance({
    token: depositToken,
    account: userAddr,
  });
  const balance = balRaw !== undefined && balRaw !== null ? BigInt(String(balRaw)) : null;

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadErc20Allowance({
    token: depositToken,
    owner: userAddr,
    spender: PECOR_ORDERS_ADDRESS,
  });
  const allowance = allowanceRaw !== undefined && allowanceRaw !== null
    ? BigInt(String(allowanceRaw))
    : null;

  // Spot price for context.
  const { data: spotPriceRaw } = useReadMetaAGQuoterGetTokenPrice(
    { token: tokenAddr },
    !!token,
  );
  const spotPrice = useMemo(() => {
    if (!spotPriceRaw) return null;
    const r = spotPriceRaw as any;
    try {
      const priceWei: bigint = Array.isArray(r) ? BigInt(r[0]) : BigInt(r.price ?? 0);
      const stale: boolean = Array.isArray(r) ? Boolean(r[2]) : Boolean(r.isStale);
      if (priceWei === 0n) return null;
      return { price: formatPriceUsd(priceWei), stale };
    } catch {
      return null;
    }
  }, [spotPriceRaw]);

  // Parsed values
  const amountBn = useMemo(() => {
    if (!amount) return null;
    try { return parseUnits(amount, depositDec); } catch { return null; }
  }, [amount, depositDec]);

  const targetPriceBn = useMemo(() => parsePriceUsd(targetPrice), [targetPrice]);
  const stopPriceBn = useMemo(() => parsePriceUsd(stopPrice), [stopPrice]);
  const limitPriceBn = useMemo(() => parsePriceUsd(limitPrice), [limitPrice]);

  const expiresAt = useMemo(() => {
    const opt = EXPIRY_OPTIONS.find((o) => o.id === expiryId);
    if (!opt) return BigInt(Math.floor(Date.now() / 1000) + 7 * 86400);
    if (opt.seconds === 'never') return BigInt('0xffffffffffffffff'); // uint64 max-ish
    return BigInt(Math.floor(Date.now() / 1000) + opt.seconds);
  }, [expiryId]);

  // Approvals
  const needsApproval = !!amountBn && allowance !== null && allowance < amountBn;
  const { write: writeApprove, isPending: approvePending, data: approveTxHash } = useWriteErc20Approve();
  const { receipt: approveReceipt } = useOptimisticReceipt(approveTxHash);
  const approveConfirming = approvePending || (!!approveTxHash && !approveReceipt);
  useEffect(() => {
    if (approveReceipt) refetchAllowance();
  }, [approveReceipt, refetchAllowance]);

  // Place hooks
  const limitBuy = useWritePecorOrdersPlaceLimitBuy();
  const limitSell = useWritePecorOrdersPlaceLimitSell();
  const stopLoss = useWritePecorOrdersPlaceStopLoss();
  const stopLimitBuy = useWritePecorOrdersPlaceStopLimitBuy();
  const stopLimitSell = useWritePecorOrdersPlaceStopLimitSell();

  const writers = [limitBuy, limitSell, stopLoss, stopLimitBuy, stopLimitSell];
  const txHash = writers.find((w) => w.data)?.data;
  const placeError = writers.find((w) => w.error)?.error;
  const placePending = writers.some((w) => w.isPending);
  const { receipt: placeReceipt } = useOptimisticReceipt(txHash);

  useEffect(() => {
    if (placeReceipt) {
      setAmount('');
      setTargetPrice('');
      setStopPrice('');
      setLimitPrice('');
      refetchBalance();
      refetchAllowance();
      onPlaced?.();
    }
  }, [placeReceipt, refetchBalance, refetchAllowance, onPlaced]);

  // Validation
  const insufficientBalance = !!amountBn && balance !== null && balance < amountBn;
  const validation = (() => {
    if (!isConnected) return 'Connect Wallet';
    if (!token) return 'Select a token';
    if (!amount || !amountBn || amountBn === 0n) return 'Enter an amount';
    if (insufficientBalance) return `Insufficient ${depositSymbol}`;
    if (kind === 'limit-buy' || kind === 'limit-sell') {
      if (!targetPriceBn) return 'Enter target price';
    } else if (kind === 'stop-loss') {
      if (!stopPriceBn) return 'Enter trigger price';
    } else if (kind === 'stop-limit-buy' || kind === 'stop-limit-sell') {
      if (!stopPriceBn) return 'Enter stop price';
      if (!limitPriceBn) return 'Enter limit price';
    }
    return null;
  })();

  const handlePlace = () => {
    if (validation) return;
    if (!token || !amountBn) return;

    if (needsApproval) {
      writeApprove({
        token: depositToken,
        spender: PECOR_ORDERS_ADDRESS,
        amount: amountBn,
      });
      return;
    }

    switch (kind) {
      case 'limit-buy':
        if (!targetPriceBn) return;
        limitBuy.write({
          stablecoin: META_AG_USDL_ADDRESS,
          token: tokenAddr,
          stablecoinAmount: amountBn,
          targetPrice: targetPriceBn,
          expiresAt,
        });
        break;
      case 'limit-sell':
        if (!targetPriceBn) return;
        limitSell.write({
          token: tokenAddr,
          stablecoin: META_AG_USDL_ADDRESS,
          tokenAmount: amountBn,
          targetPrice: targetPriceBn,
          expiresAt,
        });
        break;
      case 'stop-loss':
        if (!stopPriceBn) return;
        stopLoss.write({
          token: tokenAddr,
          stablecoin: META_AG_USDL_ADDRESS,
          tokenAmount: amountBn,
          triggerPrice: stopPriceBn,
          expiresAt,
        });
        break;
      case 'stop-limit-buy':
        if (!stopPriceBn || !limitPriceBn) return;
        stopLimitBuy.write({
          stablecoin: META_AG_USDL_ADDRESS,
          token: tokenAddr,
          stablecoinAmount: amountBn,
          stopPrice: stopPriceBn,
          limitPrice: limitPriceBn,
          expiresAt,
        });
        break;
      case 'stop-limit-sell':
        if (!stopPriceBn || !limitPriceBn) return;
        stopLimitSell.write({
          token: tokenAddr,
          stablecoin: META_AG_USDL_ADDRESS,
          tokenAmount: amountBn,
          stopPrice: stopPriceBn,
          limitPrice: limitPriceBn,
          expiresAt,
        });
        break;
    }
  };

  const isPending = placePending || approveConfirming;

  // Token selector (compact dropdown — no full modal)
  const filteredTokens = tokens.filter((t) => {
    const q = tokenSearch.toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      t.tokenAddress.includes(q)
    );
  });

  const balFmt = balance !== null ? parseFloat(formatUnits(balance, depositDec)) : 0;

  // Pretty button label
  const buttonLabel = (() => {
    if (validation) return validation;
    if (approveConfirming) return `Approving ${depositSymbol}…`;
    if (placePending) return 'Placing order…';
    if (needsApproval) return `Approve ${depositSymbol}`;
    return `Place ${ORDER_TABS.find((t) => t.id === kind)?.label}`;
  })();

  const buttonDisabled = !!validation || isPending;

  return (
    <div className="bg-dark-gray4/80 border border-dark-gray rounded-2xl overflow-hidden backdrop-blur-sm">
      {/* Tabs */}
      <div className="flex flex-wrap border-b border-dark-gray">
        {ORDER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setKind(t.id)}
            className={`flex-1 min-w-[100px] py-3 text-size-11 font-manrope-bold transition border-b-2 ${
              kind === t.id
                ? 'border-pink-middle text-white bg-dark-gray2/40'
                : 'border-transparent text-dark-disabled hover:text-half-enabled'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* Token picker */}
        <div>
          <label className="text-size-10 text-dark-disabled uppercase tracking-wide mb-1 block">Token</label>
          <div className="relative">
            <button
              onClick={() => setTokenSelectorOpen((o) => !o)}
              className="w-full bg-dark-gray2 border border-dark-gray rounded-xl p-3 flex items-center gap-3 hover:bg-dark-gray2/60 transition text-left"
            >
              {token ? (
                <>
                  <div className="relative w-7 h-7 rounded-full bg-dark-gray overflow-hidden flex-shrink-0 border border-dark-gray/70">
                    <TokenImage
                      fill
                      src={token.logo}
                      alt={token.symbol}
                      sizes="28px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-size-13 font-manrope-bold text-white">{token.symbol}</span>
                    <span className="text-size-10 text-dark-disabled ml-2">{token.name}</span>
                  </div>
                </>
              ) : (
                <span className="text-size-12 text-dark-disabled">{tokensLoading ? 'Loading tokens…' : 'Select a token'}</span>
              )}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-dark-disabled flex-shrink-0">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {tokenSelectorOpen && (
              <div className="absolute top-full mt-1 left-0 right-0 z-30 bg-dark-gray4 border border-dark-gray rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[300px]">
                <input
                  type="text"
                  value={tokenSearch}
                  onChange={(e) => setTokenSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-dark-gray2 px-3 py-2 text-size-12 text-white outline-none border-b border-dark-gray placeholder:text-dark-disabled"
                />
                <div className="overflow-y-auto flex-1">
                  {filteredTokens.length === 0 && (
                    <div className="px-4 py-8 text-center text-dark-disabled text-size-11">No tokens</div>
                  )}
                  {filteredTokens.map((t) => (
                    <button
                      key={t.tokenAddress}
                      onClick={() => { setToken(t); setTokenSelectorOpen(false); setTokenSearch(''); }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-dark-gray7/50 text-left"
                    >
                      <div className="relative w-6 h-6 rounded-full bg-dark-gray overflow-hidden flex-shrink-0">
                        <TokenImage fill src={t.logo} alt={t.symbol} sizes="24px" className="object-cover" />
                      </div>
                      <span className="text-size-12 font-manrope-bold text-white">{t.symbol}</span>
                      <span className="text-size-10 text-dark-disabled flex-1 truncate">{t.name}</span>
                      {t.price > 0 && <span className="text-size-10 text-half-enabled">{formatCurrency(t.price, 4)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {spotPrice && token && (
            <div className="text-size-10 text-dark-disabled mt-1 flex items-center gap-2">
              <span>Spot: {formatCurrency(spotPrice.price, 6)}</span>
              {spotPrice.stale && (
                <span className="text-yellow-middle font-manrope-bold">⚠ stale</span>
              )}
            </div>
          )}
        </div>

        {/* Amount field */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-size-10 text-dark-disabled uppercase tracking-wide">
              {isBuyKind ? `Pay (${depositSymbol})` : `Sell (${depositSymbol})`}
            </label>
            {balance !== null && (
              <button
                onClick={() => balance && setAmount(formatUnits(balance, depositDec))}
                className="text-size-10 text-pink-middle hover:text-pink-middle2 transition"
              >
                Balance {formatNumber(balFmt, 4)}
              </button>
            )}
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-dark-gray2 border border-dark-gray rounded-xl p-3 text-size-14 text-white outline-none focus:border-dark-gray6"
            min="0"
            step="any"
          />
        </div>

        {/* Price fields — depend on kind */}
        {(kind === 'limit-buy' || kind === 'limit-sell') && (
          <PriceField
            label={`${kind === 'limit-buy' ? 'Buy' : 'Sell'} when price ${kind === 'limit-buy' ? 'falls to' : 'reaches'} (USD)`}
            value={targetPrice}
            onChange={setTargetPrice}
            placeholder="0.00"
          />
        )}
        {kind === 'stop-loss' && (
          <PriceField
            label="Trigger sell when price falls to (USD)"
            value={stopPrice}
            onChange={setStopPrice}
            placeholder="0.00"
            tone="danger"
          />
        )}
        {kind === 'stop-limit-buy' && (
          <>
            <PriceField label="Stop price (USD)" value={stopPrice} onChange={setStopPrice} placeholder="0.00" />
            <PriceField label="Limit price (USD)" value={limitPrice} onChange={setLimitPrice} placeholder="0.00" />
          </>
        )}
        {kind === 'stop-limit-sell' && (
          <>
            <PriceField label="Stop price (USD)" value={stopPrice} onChange={setStopPrice} placeholder="0.00" tone="danger" />
            <PriceField label="Limit price (USD)" value={limitPrice} onChange={setLimitPrice} placeholder="0.00" tone="danger" />
          </>
        )}

        {/* Expiry */}
        <div>
          <label className="text-size-10 text-dark-disabled uppercase tracking-wide mb-1 block">Expiry</label>
          <div className="flex gap-1">
            {EXPIRY_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setExpiryId(o.id)}
                className={`flex-1 py-2 rounded-lg border text-size-11 font-manrope-bold transition ${
                  expiryId === o.id
                    ? 'border-green-middle/60 text-green-middle bg-green-opacity-005'
                    : 'border-dark-gray text-dark-disabled hover:text-half-enabled'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Place button */}
        <button
          onClick={handlePlace}
          disabled={buttonDisabled}
          className={`w-full py-3 rounded-xl text-size-13 font-manrope-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
            insufficientBalance
              ? 'bg-red-middle/20 text-red-middle border border-red-middle/40'
              : needsApproval
                ? 'bg-pink-middle/20 text-pink-middle border border-pink-middle/40 hover:bg-pink-middle/30'
                : isStopKind
                  ? 'bg-yellow-middle text-black-gray hover:brightness-110'
                  : 'bg-green-middle text-black-gray hover:bg-green-middle2'
          }`}
        >
          {isPending && !validation
            ? (approveConfirming ? `Approving ${depositSymbol}…` : 'Placing order…')
            : buttonLabel}
        </button>

        {placeError && (
          <div className="text-red-middle text-size-10 break-all">
            {placeError.message?.slice(0, 240)}
          </div>
        )}
        {placeReceipt && (
          <div className="text-green-middle text-size-11 text-center">Order placed ✓</div>
        )}
      </div>
    </div>
  );
}

// ── Price field with USD prefix ─────────────────────────────────

function PriceField({
  label,
  value,
  onChange,
  placeholder,
  tone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tone?: 'danger';
}) {
  return (
    <div>
      <label className="text-size-10 text-dark-disabled uppercase tracking-wide mb-1 block">{label}</label>
      <div className={`flex items-center bg-dark-gray2 border rounded-xl px-3 py-2 ${
        tone === 'danger' ? 'border-red-middle/40' : 'border-dark-gray'
      }`}>
        <span className="text-dark-disabled text-size-12 mr-1">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '0.00'}
          className="flex-1 bg-transparent text-size-14 text-white outline-none"
          min="0"
          step="any"
        />
      </div>
    </div>
  );
}
