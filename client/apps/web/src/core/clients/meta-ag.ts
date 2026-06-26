/**
 * meta-ag.ts — wagmi hooks for the Paxeer Meta-AG / PECOR contract stack
 *
 * Live addresses pulled from `backend/deployments/paxeer-network-addresses.json`
 * (chainId 125, deployedAt 2026-04-25). Function shapes verified against the
 * mirrored ABIs in `src/lib/abis/{MetaAGRouter,MetaAGQuoter,PECOROrders}.json`.
 *
 * Conventions:
 *   - All `*price*` arguments to PECOROrders are 18-decimal USD
 *     (PriceOracle.PRICE_DECIMALS = 18).
 *   - Token amounts use the token's own ERC20 decimals (read at the call site).
 *   - Hooks follow the same `useRead*` / `useWrite*` pattern as `contracts.ts`.
 */
import {
  useReadContract,
  useWriteContract,
} from 'wagmi';

import MetaAGRouterAbi from '../network/abis/MetaAGRouter.json';
import MetaAGQuoterAbi from '../network/abis/MetaAGQuoter.json';
import PECOROrdersAbi from '../network/abis/PECOROrders.json';

// ── Live addresses (Paxeer 125, deployedAt 2026-04-25) ──────────

export const META_AG_ROUTER_ADDRESS =
  '0x732ADb61D2a7a05cC52E8a54cdddB818703F6449' as const;
export const META_AG_QUOTER_ADDRESS =
  '0x52667faAbd90a6E35dcB5C526d278d72d058CC90' as const;
export const PECOR_ADDRESS =
  '0x21dE1282549E3D1884f079fAd16f5945beEcb8f6' as const;
export const PECOR_ORDERS_ADDRESS =
  '0x16bC4aB280c67977639591615d2a52273cDf5f6E' as const;
export const PECOR_VAULT_ADDRESS =
  '0x97Bd1b6A1E0916e116d5f876F929f2f9dB53312B' as const;
export const ORACLE_HUB_ADDRESS =
  '0x0687f659dc232c51E6c028913b594d18a56b8852' as const;
export const PRICE_ORACLE_ADDRESS =
  '0xC25f5aCe41D448699374D19D410cdd73e629418f' as const;
export const TRANSACTION_TRACKER_ADDRESS =
  '0x8C62e5c9794420BfE697cbf662fc520e0E4969De' as const;

// USDL is the canonical stablecoin for PECOROrders pairs.
export const META_AG_USDL_ADDRESS =
  '0x7c69c84daAEe90B21eeCABDb8f0387897E9B7B37' as const;
export const META_AG_WPAX_ADDRESS =
  '0xe5ccf339d1c89c7e6c6768b28507f78b861fc1de' as const;

// PECOROrders uses 18-dec USD prices via OracleHub.
export const META_AG_PRICE_DECIMALS = 18;

// ── Adapter ID hashes (keccak256(adapterName)) ──────────────────
//
// These are useful when the UI wants to force a specific adapter via
// `swapViaAdapter`. The router resolves these to addresses internally.
export const ADAPTER_ID_VAULT =
  '0xeae66d49ef6f97a9b89bb53b8a9ef84f7a5e3b1ce71f6a7c3e6c1ee3a3e6a7c4' as const;
// NOTE: the actual hash is derived on-chain; for `swapViaAdapter` the
// caller normally reads `getAdapters()` and copies the bytes32 ID from
// the returned struct rather than hard-coding it.

// ── PECOROrders enums (mirror IPECOROrders.sol) ─────────────────

export enum OrderType {
  LimitBuy = 0,
  LimitSell = 1,
  StopLoss = 2,
  StopLimitBuy = 3,
  StopLimitSell = 4,
}

export enum OrderStatus {
  Active = 0,
  Filled = 1,
  Cancelled = 2,
  Expired = 3,
}

// ── Quote / order tuple types (mirror Solidity structs) ─────────

export interface MetaAGQuoteResult {
  amountIn: bigint;
  amountOut: bigint;
  grossAmountOut: bigint;
  executionPrice: bigint;
  spotPriceIn: bigint;
  spotPriceOut: bigint;
  feeAmount: bigint;
  feeBps: bigint;
  sufficientLiquidity: boolean;
  availableLiquidity: bigint;
  priceTimestampIn: bigint;
  priceTimestampOut: bigint;
  priceStaleIn: boolean;
  priceStaleOut: boolean;
}

export interface MetaAGBestQuote {
  amountOut: bigint;
  priceImpactBps: bigint;
  feeBps: bigint;
  feeAmount: bigint;
  adapterId: `0x${string}`;
  adapter: `0x${string}`;
  adapterData: `0x${string}`;
  found: boolean;
}

export interface MetaAGAdapterEntry {
  adapterId: `0x${string}`;
  adapter: `0x${string}`;
  active: boolean;
  name: string;
}

export interface PecorLimitOrder {
  id: bigint;
  user: `0x${string}`;
  stablecoin: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  targetPrice: bigint;
  orderType: OrderType;
  status: OrderStatus;
  createdAt: bigint;
  expiresAt: bigint;
}

export interface PecorStopLimitOrder {
  id: bigint;
  user: `0x${string}`;
  stablecoin: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  stopPrice: bigint;
  limitPrice: bigint;
  orderType: OrderType;
  status: OrderStatus;
  createdAt: bigint;
  expiresAt: bigint;
}

// ── MetaAGQuoter reads ──────────────────────────────────────────

export function useReadMetaAGQuoterQuoteExactIn(
  args: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint },
  enabled = true,
) {
  return useReadContract({
    address: META_AG_QUOTER_ADDRESS,
    abi: MetaAGQuoterAbi as any,
    functionName: 'quoteExactIn',
    args: [args.tokenIn, args.tokenOut, args.amountIn],
    query: { enabled },
  });
}

export function useReadMetaAGQuoterGetTokenPrice(
  args: { token: `0x${string}` },
  enabled = true,
) {
  return useReadContract({
    address: META_AG_QUOTER_ADDRESS,
    abi: MetaAGQuoterAbi as any,
    functionName: 'getTokenPrice',
    args: [args.token],
    query: { enabled },
  });
}

export function useReadMetaAGQuoterGetLiquidityInfo(
  args: { token: `0x${string}` },
  enabled = true,
) {
  return useReadContract({
    address: META_AG_QUOTER_ADDRESS,
    abi: MetaAGQuoterAbi as any,
    functionName: 'getLiquidityInfo',
    args: [args.token],
    query: { enabled },
  });
}

// ── MetaAGRouter reads ──────────────────────────────────────────

export function useReadMetaAGRouterGetBestQuote(
  args: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint },
  enabled = true,
) {
  return useReadContract({
    address: META_AG_ROUTER_ADDRESS,
    abi: MetaAGRouterAbi as any,
    functionName: 'getBestQuote',
    args: [args.tokenIn, args.tokenOut, args.amountIn],
    query: { enabled },
  });
}

export function useReadMetaAGRouterGetAllQuotes(
  args: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint },
  enabled = true,
) {
  return useReadContract({
    address: META_AG_ROUTER_ADDRESS,
    abi: MetaAGRouterAbi as any,
    functionName: 'getAllQuotes',
    args: [args.tokenIn, args.tokenOut, args.amountIn],
    query: { enabled },
  });
}

export function useReadMetaAGRouterGetAdapters() {
  return useReadContract({
    address: META_AG_ROUTER_ADDRESS,
    abi: MetaAGRouterAbi as any,
    functionName: 'getAdapters',
  });
}

export function useReadMetaAGRouterIsAdapterActive(
  args: { adapterId: `0x${string}` },
) {
  return useReadContract({
    address: META_AG_ROUTER_ADDRESS,
    abi: MetaAGRouterAbi as any,
    functionName: 'isAdapterActive',
    args: [args.adapterId],
  });
}

// ── MetaAGRouter writes ─────────────────────────────────────────

export interface SwapBestRouteArgs {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  amountOutMin: bigint;
  deadline: bigint;
}

export function useWriteMetaAGRouterSwapBestRoute() {
  const result = useWriteContract();
  const write = (args: SwapBestRouteArgs) =>
    result.writeContract({
      address: META_AG_ROUTER_ADDRESS,
      abi: MetaAGRouterAbi as any,
      functionName: 'swapBestRoute',
      args: [args.tokenIn, args.tokenOut, args.amountIn, args.amountOutMin, args.deadline],
    });
  return { ...result, write };
}

export interface SwapViaAdapterArgs {
  adapterId: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  amountOutMin: bigint;
  deadline: bigint;
}

export function useWriteMetaAGRouterSwapViaAdapter() {
  const result = useWriteContract();
  const write = (args: SwapViaAdapterArgs) =>
    result.writeContract({
      address: META_AG_ROUTER_ADDRESS,
      abi: MetaAGRouterAbi as any,
      functionName: 'swapViaAdapter',
      args: [
        args.adapterId,
        args.tokenIn,
        args.tokenOut,
        args.amountIn,
        args.amountOutMin,
        args.deadline,
      ],
    });
  return { ...result, write };
}

export interface MetaAGHopParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  adapterId: `0x${string}`;
  minAmountOut: bigint;
}

export function useWriteMetaAGRouterSwapMultiHop() {
  const result = useWriteContract();
  const write = (args: {
    hops: MetaAGHopParams[];
    amountIn: bigint;
    amountOutMin: bigint;
    deadline: bigint;
  }) =>
    result.writeContract({
      address: META_AG_ROUTER_ADDRESS,
      abi: MetaAGRouterAbi as any,
      functionName: 'swapMultiHop',
      args: [args.hops, args.amountIn, args.amountOutMin, args.deadline],
    });
  return { ...result, write };
}

// ── PECOROrders reads ───────────────────────────────────────────

export function useReadPecorOrdersGetUserLimitOrders(
  args: { user: `0x${string}` },
  enabled = true,
) {
  return useReadContract({
    address: PECOR_ORDERS_ADDRESS,
    abi: PECOROrdersAbi as any,
    functionName: 'getUserLimitOrders',
    args: [args.user],
    query: { enabled },
  });
}

export function useReadPecorOrdersGetUserStopLimitOrders(
  args: { user: `0x${string}` },
  enabled = true,
) {
  return useReadContract({
    address: PECOR_ORDERS_ADDRESS,
    abi: PECOROrdersAbi as any,
    functionName: 'getUserStopLimitOrders',
    args: [args.user],
    query: { enabled },
  });
}

export function useReadPecorOrdersGetLimitOrder(
  args: { orderId: bigint },
  enabled = true,
) {
  return useReadContract({
    address: PECOR_ORDERS_ADDRESS,
    abi: PECOROrdersAbi as any,
    functionName: 'getLimitOrder',
    args: [args.orderId],
    query: { enabled },
  });
}

export function useReadPecorOrdersGetStopLimitOrder(
  args: { orderId: bigint },
  enabled = true,
) {
  return useReadContract({
    address: PECOR_ORDERS_ADDRESS,
    abi: PECOROrdersAbi as any,
    functionName: 'getStopLimitOrder',
    args: [args.orderId],
    query: { enabled },
  });
}

export function useReadPecorOrdersCanExecuteLimitOrder(
  args: { orderId: bigint },
  enabled = true,
) {
  return useReadContract({
    address: PECOR_ORDERS_ADDRESS,
    abi: PECOROrdersAbi as any,
    functionName: 'canExecuteLimitOrder',
    args: [args.orderId],
    query: { enabled },
  });
}

// ── PECOROrders writes ──────────────────────────────────────────

export interface PlaceLimitBuyArgs {
  stablecoin: `0x${string}`;
  token: `0x${string}`;
  stablecoinAmount: bigint;
  targetPrice: bigint; // 18-dec USD
  expiresAt: bigint; // unix seconds
}

export function useWritePecorOrdersPlaceLimitBuy() {
  const result = useWriteContract();
  const write = (args: PlaceLimitBuyArgs) =>
    result.writeContract({
      address: PECOR_ORDERS_ADDRESS,
      abi: PECOROrdersAbi as any,
      functionName: 'placeLimitBuy',
      args: [
        args.stablecoin,
        args.token,
        args.stablecoinAmount,
        args.targetPrice,
        args.expiresAt,
      ],
    });
  return { ...result, write };
}

export interface PlaceLimitSellArgs {
  token: `0x${string}`;
  stablecoin: `0x${string}`;
  tokenAmount: bigint;
  targetPrice: bigint; // 18-dec USD
  expiresAt: bigint;
}

export function useWritePecorOrdersPlaceLimitSell() {
  const result = useWriteContract();
  const write = (args: PlaceLimitSellArgs) =>
    result.writeContract({
      address: PECOR_ORDERS_ADDRESS,
      abi: PECOROrdersAbi as any,
      functionName: 'placeLimitSell',
      args: [
        args.token,
        args.stablecoin,
        args.tokenAmount,
        args.targetPrice,
        args.expiresAt,
      ],
    });
  return { ...result, write };
}

export interface PlaceStopLossArgs {
  token: `0x${string}`;
  stablecoin: `0x${string}`;
  tokenAmount: bigint;
  triggerPrice: bigint; // 18-dec USD
  expiresAt: bigint;
}

export function useWritePecorOrdersPlaceStopLoss() {
  const result = useWriteContract();
  const write = (args: PlaceStopLossArgs) =>
    result.writeContract({
      address: PECOR_ORDERS_ADDRESS,
      abi: PECOROrdersAbi as any,
      functionName: 'placeStopLoss',
      args: [
        args.token,
        args.stablecoin,
        args.tokenAmount,
        args.triggerPrice,
        args.expiresAt,
      ],
    });
  return { ...result, write };
}

export interface PlaceStopLimitBuyArgs {
  stablecoin: `0x${string}`;
  token: `0x${string}`;
  stablecoinAmount: bigint;
  stopPrice: bigint;
  limitPrice: bigint;
  expiresAt: bigint;
}

export function useWritePecorOrdersPlaceStopLimitBuy() {
  const result = useWriteContract();
  const write = (args: PlaceStopLimitBuyArgs) =>
    result.writeContract({
      address: PECOR_ORDERS_ADDRESS,
      abi: PECOROrdersAbi as any,
      functionName: 'placeStopLimitBuy',
      args: [
        args.stablecoin,
        args.token,
        args.stablecoinAmount,
        args.stopPrice,
        args.limitPrice,
        args.expiresAt,
      ],
    });
  return { ...result, write };
}

export interface PlaceStopLimitSellArgs {
  token: `0x${string}`;
  stablecoin: `0x${string}`;
  tokenAmount: bigint;
  stopPrice: bigint;
  limitPrice: bigint;
  expiresAt: bigint;
}

export function useWritePecorOrdersPlaceStopLimitSell() {
  const result = useWriteContract();
  const write = (args: PlaceStopLimitSellArgs) =>
    result.writeContract({
      address: PECOR_ORDERS_ADDRESS,
      abi: PECOROrdersAbi as any,
      functionName: 'placeStopLimitSell',
      args: [
        args.token,
        args.stablecoin,
        args.tokenAmount,
        args.stopPrice,
        args.limitPrice,
        args.expiresAt,
      ],
    });
  return { ...result, write };
}

export function useWritePecorOrdersCancelLimitOrder() {
  const result = useWriteContract();
  const write = (args: { orderId: bigint }) =>
    result.writeContract({
      address: PECOR_ORDERS_ADDRESS,
      abi: PECOROrdersAbi as any,
      functionName: 'cancelLimitOrder',
      args: [args.orderId],
    });
  return { ...result, write };
}

export function useWritePecorOrdersCancelStopLimitOrder() {
  const result = useWriteContract();
  const write = (args: { orderId: bigint }) =>
    result.writeContract({
      address: PECOR_ORDERS_ADDRESS,
      abi: PECOROrdersAbi as any,
      functionName: 'cancelStopLimitOrder',
      args: [args.orderId],
    });
  return { ...result, write };
}

// ── Tuple normalisers ───────────────────────────────────────────
//
// wagmi returns struct outputs as either tuples (array form) or named
// objects depending on solc / viem version. These helpers normalise to
// a typed object shape regardless of which form arrives.

export function normaliseQuote(raw: unknown): MetaAGQuoteResult | null {
  if (!raw) return null;
  const q = raw as any;
  try {
    if (Array.isArray(q)) {
      return {
        amountIn: BigInt(q[0]),
        amountOut: BigInt(q[1]),
        grossAmountOut: BigInt(q[2]),
        executionPrice: BigInt(q[3]),
        spotPriceIn: BigInt(q[4]),
        spotPriceOut: BigInt(q[5]),
        feeAmount: BigInt(q[6]),
        feeBps: BigInt(q[7]),
        sufficientLiquidity: Boolean(q[8]),
        availableLiquidity: BigInt(q[9]),
        priceTimestampIn: BigInt(q[10]),
        priceTimestampOut: BigInt(q[11]),
        priceStaleIn: Boolean(q[12]),
        priceStaleOut: Boolean(q[13]),
      };
    }
    return {
      amountIn: BigInt(q.amountIn ?? 0),
      amountOut: BigInt(q.amountOut ?? 0),
      grossAmountOut: BigInt(q.grossAmountOut ?? 0),
      executionPrice: BigInt(q.executionPrice ?? 0),
      spotPriceIn: BigInt(q.spotPriceIn ?? 0),
      spotPriceOut: BigInt(q.spotPriceOut ?? 0),
      feeAmount: BigInt(q.feeAmount ?? 0),
      feeBps: BigInt(q.feeBps ?? 0),
      sufficientLiquidity: Boolean(q.sufficientLiquidity),
      availableLiquidity: BigInt(q.availableLiquidity ?? 0),
      priceTimestampIn: BigInt(q.priceTimestampIn ?? 0),
      priceTimestampOut: BigInt(q.priceTimestampOut ?? 0),
      priceStaleIn: Boolean(q.priceStaleIn),
      priceStaleOut: Boolean(q.priceStaleOut),
    };
  } catch {
    return null;
  }
}

export function normaliseBestQuote(raw: unknown): MetaAGBestQuote | null {
  if (!raw) return null;
  const q = raw as any;
  try {
    if (Array.isArray(q)) {
      return {
        amountOut: BigInt(q[0]),
        priceImpactBps: BigInt(q[1]),
        feeBps: BigInt(q[2]),
        feeAmount: BigInt(q[3]),
        adapterId: q[4] as `0x${string}`,
        adapter: q[5] as `0x${string}`,
        adapterData: q[6] as `0x${string}`,
        found: Boolean(q[7]),
      };
    }
    return {
      amountOut: BigInt(q.amountOut ?? 0),
      priceImpactBps: BigInt(q.priceImpactBps ?? 0),
      feeBps: BigInt(q.feeBps ?? 0),
      feeAmount: BigInt(q.feeAmount ?? 0),
      adapterId: q.adapterId,
      adapter: q.adapter,
      adapterData: q.adapterData ?? '0x',
      found: Boolean(q.found),
    };
  } catch {
    return null;
  }
}

export function normaliseLimitOrder(raw: unknown): PecorLimitOrder | null {
  if (!raw) return null;
  const o = raw as any;
  try {
    if (Array.isArray(o)) {
      return {
        id: BigInt(o[0]),
        user: o[1] as `0x${string}`,
        stablecoin: o[2] as `0x${string}`,
        token: o[3] as `0x${string}`,
        amount: BigInt(o[4]),
        targetPrice: BigInt(o[5]),
        orderType: Number(o[6]) as OrderType,
        status: Number(o[7]) as OrderStatus,
        createdAt: BigInt(o[8]),
        expiresAt: BigInt(o[9]),
      };
    }
    return {
      id: BigInt(o.id ?? 0),
      user: o.user,
      stablecoin: o.stablecoin,
      token: o.token,
      amount: BigInt(o.amount ?? 0),
      targetPrice: BigInt(o.targetPrice ?? 0),
      orderType: Number(o.orderType ?? 0) as OrderType,
      status: Number(o.status ?? 0) as OrderStatus,
      createdAt: BigInt(o.createdAt ?? 0),
      expiresAt: BigInt(o.expiresAt ?? 0),
    };
  } catch {
    return null;
  }
}

export function normaliseStopLimitOrder(
  raw: unknown,
): PecorStopLimitOrder | null {
  if (!raw) return null;
  const o = raw as any;
  try {
    if (Array.isArray(o)) {
      return {
        id: BigInt(o[0]),
        user: o[1] as `0x${string}`,
        stablecoin: o[2] as `0x${string}`,
        token: o[3] as `0x${string}`,
        amount: BigInt(o[4]),
        stopPrice: BigInt(o[5]),
        limitPrice: BigInt(o[6]),
        orderType: Number(o[7]) as OrderType,
        status: Number(o[8]) as OrderStatus,
        createdAt: BigInt(o[9]),
        expiresAt: BigInt(o[10]),
      };
    }
    return {
      id: BigInt(o.id ?? 0),
      user: o.user,
      stablecoin: o.stablecoin,
      token: o.token,
      amount: BigInt(o.amount ?? 0),
      stopPrice: BigInt(o.stopPrice ?? 0),
      limitPrice: BigInt(o.limitPrice ?? 0),
      orderType: Number(o.orderType ?? 0) as OrderType,
      status: Number(o.status ?? 0) as OrderStatus,
      createdAt: BigInt(o.createdAt ?? 0),
      expiresAt: BigInt(o.expiresAt ?? 0),
    };
  } catch {
    return null;
  }
}

export function normaliseAdapters(raw: unknown): MetaAGAdapterEntry[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      try {
        if (Array.isArray(entry)) {
          return {
            adapterId: entry[0] as `0x${string}`,
            adapter: entry[1] as `0x${string}`,
            active: Boolean(entry[2]),
            name: String(entry[3] ?? ''),
          };
        }
        return {
          adapterId: entry.adapterId,
          adapter: entry.adapter,
          active: Boolean(entry.active),
          name: String(entry.name ?? ''),
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is MetaAGAdapterEntry => x !== null);
}

// ── Re-exports for typing ───────────────────────────────────────

export { MetaAGRouterAbi, MetaAGQuoterAbi, PECOROrdersAbi };
