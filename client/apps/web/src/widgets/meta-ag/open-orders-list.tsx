'use client';

/**
 * OpenOrdersList — lists the connected user's active limit & stop-limit
 * orders from PECOROrders and offers per-row cancel.
 *
 * Architecture:
 *   - Top-level fetches `getUserLimitOrders(user)` and
 *     `getUserStopLimitOrders(user)` to get arrays of order IDs.
 *   - Each ID renders a `<LimitOrderRow>` / `<StopLimitOrderRow>` that
 *     does its own `getLimitOrder(id)` / `getStopLimitOrder(id)` read.
 *     Hooks-per-row keeps the React rules-of-hooks intact and lets each
 *     row independently refetch on cancel.
 *   - Inactive orders (Filled / Cancelled / Expired) are filtered out so
 *     the list only ever shows actionable orders.
 */
import { useMemo, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useOptimisticReceipt } from '@/hooks/tx/use-optimistic-receipt';
import { formatUnits } from 'viem';

import { useReadErc20Decimals } from '@/core/network/contracts';
import {
  OrderStatus,
  OrderType,
  META_AG_PRICE_DECIMALS,
  useReadPecorOrdersGetUserLimitOrders,
  useReadPecorOrdersGetUserStopLimitOrders,
  useReadPecorOrdersGetLimitOrder,
  useReadPecorOrdersGetStopLimitOrder,
  useWritePecorOrdersCancelLimitOrder,
  useWritePecorOrdersCancelStopLimitOrder,
  normaliseLimitOrder,
  normaliseStopLimitOrder,
  type PecorLimitOrder,
  type PecorStopLimitOrder,
} from '@/core/clients/meta-ag';
import { formatNumber, formatCurrency, formatAddress } from '@/utils/format';

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  [OrderType.LimitBuy]: 'Limit Buy',
  [OrderType.LimitSell]: 'Limit Sell',
  [OrderType.StopLoss]: 'Stop Loss',
  [OrderType.StopLimitBuy]: 'Stop-Limit Buy',
  [OrderType.StopLimitSell]: 'Stop-Limit Sell',
};

function isBuyType(t: OrderType): boolean {
  return t === OrderType.LimitBuy || t === OrderType.StopLimitBuy;
}

function formatExpiry(expiresAt: bigint): string {
  if (expiresAt === 0n) return 'Never';
  const max = BigInt('0xffffffffffffffff');
  if (expiresAt >= max - 1000n) return 'GTC';
  const seconds = Number(expiresAt) - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return 'Expired';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatAge(createdAt: bigint): string {
  if (createdAt === 0n) return '—';
  const seconds = Math.floor(Date.now() / 1000) - Number(createdAt);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ── Top-level list ──────────────────────────────────────────────

export interface OpenOrdersListProps {
  /** Bumping this number triggers an upstream refetch (useful after placing a new order). */
  refreshSignal?: number;
}

export default function OpenOrdersList({ refreshSignal }: OpenOrdersListProps) {
  const { address, isConnected } = useAccount();

  const userAddr = (address || '0x0000000000000000000000000000000000000000') as `0x${string}`;

  const {
    data: limitIdsRaw,
    refetch: refetchLimitIds,
    isLoading: limitLoading,
  } = useReadPecorOrdersGetUserLimitOrders({ user: userAddr }, isConnected);

  const {
    data: stopIdsRaw,
    refetch: refetchStopIds,
    isLoading: stopLoading,
  } = useReadPecorOrdersGetUserStopLimitOrders({ user: userAddr }, isConnected);

  // refresh on signal
  useEffect(() => {
    if (!isConnected) return;
    refetchLimitIds();
    refetchStopIds();
  }, [refreshSignal, isConnected, refetchLimitIds, refetchStopIds]);

  const limitIds = useMemo(() => {
    if (!limitIdsRaw || !Array.isArray(limitIdsRaw)) return [] as bigint[];
    return (limitIdsRaw as Array<bigint | string | number>).map((x) => BigInt(x));
  }, [limitIdsRaw]);

  const stopIds = useMemo(() => {
    if (!stopIdsRaw || !Array.isArray(stopIdsRaw)) return [] as bigint[];
    return (stopIdsRaw as Array<bigint | string | number>).map((x) => BigInt(x));
  }, [stopIdsRaw]);

  if (!isConnected) {
    return (
      <div className="border border-dark-gray rounded-2xl bg-dark-gray4/50 p-8 text-center">
        <p className="text-size-12 text-dark-disabled">Connect your wallet to see open orders.</p>
      </div>
    );
  }

  const totalLoading = limitLoading || stopLoading;
  const empty = limitIds.length === 0 && stopIds.length === 0;

  return (
    <div className="border border-dark-gray rounded-2xl bg-dark-gray4/80 overflow-hidden">
      <div className="px-4 py-3 border-b border-dark-gray flex items-center justify-between">
        <h3 className="text-size-13 font-manrope-bold text-white">
          Open orders
          <span className="text-dark-disabled font-manrope-medium text-size-11 ml-2">
            ({limitIds.length + stopIds.length})
          </span>
        </h3>
        <button
          onClick={() => { refetchLimitIds(); refetchStopIds(); }}
          className="text-size-10 text-pink-middle hover:text-pink-middle2 transition"
          title="Refresh"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="divide-y divide-dark-gray">
        {totalLoading && empty && (
          <div className="px-4 py-8 text-center text-dark-disabled text-size-11 animate-pulse">Loading orders…</div>
        )}
        {!totalLoading && empty && (
          <div className="px-4 py-10 text-center text-dark-disabled text-size-12">
            No open orders. Place one with the form above.
          </div>
        )}
        {limitIds.map((id) => (
          <LimitOrderRow
            key={`l-${id.toString()}`}
            orderId={id}
            onCancelled={() => refetchLimitIds()}
          />
        ))}
        {stopIds.map((id) => (
          <StopLimitOrderRow
            key={`s-${id.toString()}`}
            orderId={id}
            onCancelled={() => refetchStopIds()}
          />
        ))}
      </div>
    </div>
  );
}

// ── Limit order row ─────────────────────────────────────────────

function LimitOrderRow({
  orderId,
  onCancelled,
}: {
  orderId: bigint;
  onCancelled: () => void;
}) {
  const { data: orderRaw, refetch } = useReadPecorOrdersGetLimitOrder({ orderId });
  const order = useMemo(() => normaliseLimitOrder(orderRaw), [orderRaw]);

  // Skip non-active orders so the list never shows stale rows.
  if (!order || order.status !== OrderStatus.Active) return null;

  return (
    <OrderRowFrame
      order={order}
      kind="limit"
      onCancelled={() => { refetch(); onCancelled(); }}
    />
  );
}

// ── Stop-limit / stop-loss row ──────────────────────────────────

function StopLimitOrderRow({
  orderId,
  onCancelled,
}: {
  orderId: bigint;
  onCancelled: () => void;
}) {
  const { data: orderRaw, refetch } = useReadPecorOrdersGetStopLimitOrder({ orderId });
  const order = useMemo(() => normaliseStopLimitOrder(orderRaw), [orderRaw]);

  if (!order || order.status !== OrderStatus.Active) return null;

  return (
    <OrderRowFrame
      order={order}
      kind="stop"
      onCancelled={() => { refetch(); onCancelled(); }}
    />
  );
}

// ── Shared row frame ────────────────────────────────────────────

function OrderRowFrame({
  order,
  kind,
  onCancelled,
}: {
  order: PecorLimitOrder | PecorStopLimitOrder;
  kind: 'limit' | 'stop';
  onCancelled: () => void;
}) {
  // Read decimals for amount formatting. Buy orders deposit USDL
  // (read decimals on the stablecoin); sell orders deposit token.
  const buy = isBuyType(order.orderType);
  const depositToken = (buy ? order.stablecoin : order.token) as `0x${string}`;
  const { data: depositDecRaw } = useReadErc20Decimals({ token: depositToken });
  const depositDec = depositDecRaw !== undefined && depositDecRaw !== null
    ? Number(depositDecRaw)
    : 18;

  const cancelLimit = useWritePecorOrdersCancelLimitOrder();
  const cancelStop = useWritePecorOrdersCancelStopLimitOrder();
  const txHash = kind === 'limit' ? cancelLimit.data : cancelStop.data;
  const isPending = (kind === 'limit' ? cancelLimit.isPending : cancelStop.isPending);
  const error = kind === 'limit' ? cancelLimit.error : cancelStop.error;
  const { receipt } = useOptimisticReceipt(txHash);

  useEffect(() => {
    if (receipt) onCancelled();
  }, [receipt, onCancelled]);

  const handleCancel = () => {
    if (kind === 'limit') cancelLimit.write({ orderId: order.id });
    else cancelStop.write({ orderId: order.id });
  };

  const amountFmt = parseFloat(formatUnits(order.amount, depositDec));
  const buyTone = buy;

  // Pricing display differs between LimitOrder (single targetPrice) and
  // StopLimitOrder (stopPrice + limitPrice). Stop-loss is a StopLimitOrder
  // with limitPrice=0 — surface it as a single trigger value.
  const priceCells = (() => {
    if ('targetPrice' in order) {
      const target = parseFloat(formatUnits(order.targetPrice, META_AG_PRICE_DECIMALS));
      return [{ label: 'Target', value: formatCurrency(target, 6) }];
    }
    const stop = parseFloat(formatUnits(order.stopPrice, META_AG_PRICE_DECIMALS));
    const limit = parseFloat(formatUnits(order.limitPrice, META_AG_PRICE_DECIMALS));
    if (order.orderType === OrderType.StopLoss || order.limitPrice === 0n) {
      return [{ label: 'Trigger', value: formatCurrency(stop, 6) }];
    }
    return [
      { label: 'Stop', value: formatCurrency(stop, 6) },
      { label: 'Limit', value: formatCurrency(limit, 6) },
    ];
  })();

  return (
    <div className="px-4 py-3 hover:bg-dark-gray2/30 transition flex flex-col sm:flex-row gap-3 sm:items-center">
      {/* Type + token */}
      <div className="flex items-center gap-2 sm:w-[180px] flex-shrink-0">
        <span className={`text-size-9 px-1.5 py-0.5 rounded font-manrope-bold uppercase tracking-wider ${
          buyTone ? 'bg-green-opacity-005 text-green-middle border border-green-middle4'
                  : 'bg-red-opacity-015 text-red-middle border border-red-middle/40'
        }`}>
          {ORDER_TYPE_LABEL[order.orderType]}
        </span>
        <span className="text-size-11 text-half-enabled font-manrope-bold">
          {formatAddress(order.token, 4)}
        </span>
      </div>

      {/* Amount */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-size-10 text-dark-disabled uppercase tracking-wider">
          {buy ? 'Pay' : 'Sell'}
        </span>
        <span className="text-size-12 font-manrope-bold text-white">
          {formatNumber(amountFmt, 4)} {buy ? 'USDL' : '—'}
        </span>
      </div>

      {/* Prices */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {priceCells.map((c) => (
          <div key={c.label} className="flex flex-col gap-0.5">
            <span className="text-size-10 text-dark-disabled uppercase tracking-wider">{c.label}</span>
            <span className="text-size-12 font-manrope-bold text-white">{c.value}</span>
          </div>
        ))}
      </div>

      {/* Expiry / age */}
      <div className="flex flex-col gap-0.5 flex-shrink-0 sm:w-[80px]">
        <span className="text-size-10 text-dark-disabled uppercase tracking-wider">Expires</span>
        <span className="text-size-11 font-manrope-bold text-half-enabled">
          {formatExpiry(order.expiresAt)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 flex-shrink-0 sm:w-[80px]">
        <span className="text-size-10 text-dark-disabled uppercase tracking-wider">Age</span>
        <span className="text-size-11 font-manrope-medium text-dark-disabled">
          {formatAge(order.createdAt)}
        </span>
      </div>

      {/* Cancel */}
      <button
        onClick={handleCancel}
        disabled={isPending}
        className="ml-auto px-3 py-1.5 rounded-lg border border-red-middle/30 text-red-middle text-size-11 font-manrope-bold hover:bg-red-middle/10 transition flex-shrink-0 disabled:opacity-40"
      >
        {isPending ? 'Cancelling…' : 'Cancel'}
      </button>
      {error && (
        <span className="text-size-10 text-red-middle break-all flex-shrink-0 sm:hidden">
          {error.message?.slice(0, 80)}
        </span>
      )}
    </div>
  );
}
