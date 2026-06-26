/**
 * PNL Service client — https://pnl-production-4208.up.railway.app
 *
 * Decimal conventions (all on-chain numeric fields are uint256 decimal strings):
 *   USDL raw (÷ 10^6):  totalUsdl*, realizedPnlUsdl, marketCapUsdl, usdlAmount, fee
 *   token raw (÷ 10^18): totalTokens*, currentHoldings, tokenAmount
 *   WAD (÷ 10^18):       price, avgCostBasis, priceWad
 *   basis points:        priceChange24hBps (÷ 100 for %)
 *
 * All addresses MUST be lowercased before hitting the API.
 */

import { getAddress, isAddress } from 'viem';
import { sdkBaseUrls } from '../sdk-config';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export type Hex = `0x${string}`;
export type U256 = string; // decimal bigint-as-string

export interface UserPosition {
  userAddress: Hex;
  poolAddress: Hex;
  tokenAddress: Hex;
  totalUsdlSpent: U256;
  totalTokensBought: U256;
  totalUsdlReceived: U256;
  totalTokensSold: U256;
  avgCostBasis: U256; // WAD
  currentHoldings: U256;
  realizedPnlUsdl: U256; // signed — can start with '-'
  firstBuyTs: number | null;
  lastTradeTs: number;
  tradeCount: number;
}

export interface UserTrade {
  id: string;
  userAddress: Hex;
  poolAddress: Hex;
  tokenAddress: Hex;
  isBuy: boolean;
  usdlAmount: U256;
  tokenAmount: U256;
  price: U256; // WAD
  fee: U256;
  blockNumber: number;
  blockTimestamp: number;
  txHash: Hex;
}

export interface CardSnapshot {
  version: 1;
  ownerAddress: Hex;
  poolAddress: Hex;
  tokenAddress: Hex;
  tokenSymbol?: string;
  tokenName?: string;
  position: Omit<UserPosition, 'userAddress' | 'poolAddress' | 'tokenAddress'>;
  market: {
    priceWad: U256 | null;
    marketCapUsdl: U256 | null;
    priceChange24hBps: string | null;
  };
  capturedAt: number;
}

export interface MintedCard {
  cardId: string;
  shortCode: string;
  shareUrl: string;
  ogUrl: string;
  snapshot: CardSnapshot;
  createdAt?: number;
}

export interface SharerStats {
  address: Hex;
  shortCodes: string[];
  totalViews: number;
  totalClicks: number;
  totalWalletBinds: number;
  totalConversions: number;
  pendingRewards: number;
  creditedRewards: number;
}

export interface PnlStatus {
  indexerHead: number;
  consumerBlock: number;
  consumerLag: number;
  reconcilerBlock: number;
  uptime: string;
  status: string;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

const WAD = 10n ** 18n;

/** USDL raw (6-dec decimal string) → number in USD. */
export function usdlToNum(raw: U256 | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const s = String(raw);
  const neg = s.startsWith('-');
  const abs = neg ? s.slice(1) : s;
  let v: number;
  try {
    v = Number(BigInt(abs)) / 1e6;
  } catch {
    v = 0;
  }
  return neg ? -v : v;
}

/** WAD (18-dec decimal string) → number. */
export function wadToNum(raw: U256 | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const s = String(raw);
  const neg = s.startsWith('-');
  const abs = neg ? s.slice(1) : s;
  let v: number;
  try {
    v = Number(BigInt(abs)) / 1e18;
  } catch {
    v = 0;
  }
  return neg ? -v : v;
}

/** Token raw (18-dec decimal string) → number of tokens. */
export function tokenToNum(raw: U256 | null | undefined): number {
  return wadToNum(raw);
}

/**
 * Compute total multiple of a position (e.g. 2.5x means all invested turned into 2.5× back).
 * Formula: (realised_received + unrealised_mark) / total_spent
 */
export function computeMultiple(
  p: Pick<UserPosition, 'totalUsdlSpent' | 'totalUsdlReceived' | 'currentHoldings'>,
  livePriceWad: U256 | null,
): number {
  let spent: bigint;
  try {
    spent = BigInt(p.totalUsdlSpent);
  } catch {
    return 0;
  }
  if (spent === 0n) return 0;
  const live = livePriceWad ? safeBigInt(livePriceWad) : 0n;
  const holdings = safeBigInt(p.currentHoldings);
  const unrealized = live === 0n ? 0n : (live * holdings) / WAD;
  const received = safeBigInt(p.totalUsdlReceived);
  return Number(((received + unrealized) * 1000n) / spent) / 1000;
}

/**
 * Signed total PNL in USDL raw (6-dec bigint).
 * realized_pnl_usdl + (unrealized_mark - remaining_cost)
 */
export function computeTotalPnlUsdl(
  p: Pick<UserPosition, 'realizedPnlUsdl' | 'avgCostBasis' | 'currentHoldings'>,
  livePriceWad: U256 | null,
): bigint {
  const live = livePriceWad ? safeBigInt(livePriceWad) : 0n;
  const holdings = safeBigInt(p.currentHoldings);
  const unrealized = live === 0n ? 0n : (live * holdings) / WAD;
  const remainingCost = (safeBigInt(p.avgCostBasis) * holdings) / WAD;
  return safeBigInt(p.realizedPnlUsdl) + (unrealized - remainingCost);
}

/** Convert signed USDL raw bigint → number in USD (dollars). */
export function pnlBigintToUsd(pnl: bigint): number {
  const neg = pnl < 0n;
  const abs = neg ? -pnl : pnl;
  const v = Number(abs) / 1e6;
  return neg ? -v : v;
}

function safeBigInt(v: U256 | null | undefined): bigint {
  if (v === null || v === undefined || v === '') return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

/** Lowercase an address (required before hitting the API to avoid cache-key mismatches). */
export function lc(addr: string | undefined | null): Hex {
  return (addr ? addr.toLowerCase() : '0x0000000000000000000000000000000000000000') as Hex;
}

/**
 * EIP-55 checksum an address. The PNL API returns addresses lowercased, but
 * other surfaces in the app (stats, ranking, routing) expect the checksummed
 * form — use this whenever you build a `/token/{addr}` or `/profile/{addr}`
 * link from a PNL response. Falls back to the raw string if the input is not
 * a valid 20-byte hex address so we never throw at render time.
 */
export function ca(addr: string | undefined | null): string {
  if (!addr) return '';
  try {
    if (isAddress(addr)) return getAddress(addr);
  } catch {}
  return addr;
}

// ═══════════════════════════════════════════════════════════
// API client
// ═══════════════════════════════════════════════════════════

const base = () => sdkBaseUrls.pnl;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {}
    throw new PnlApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

export class PnlApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'PnlApiError';
  }
}

// ── Portfolio reads ──────────────────────────────────────────

export async function getPositions(address: string): Promise<{ user: Hex; positions: UserPosition[] }> {
  return req(`/users/${lc(address)}/positions`);
}

export async function getPosition(address: string, poolAddress: string): Promise<UserPosition | null> {
  try {
    return await req<UserPosition>(`/users/${lc(address)}/positions/${lc(poolAddress)}`);
  } catch (e) {
    if (e instanceof PnlApiError && e.status === 404) return null;
    throw e;
  }
}

export interface GetTradesParams {
  pool?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export async function getTrades(
  address: string,
  params: GetTradesParams = {},
): Promise<{ user: Hex; trades: UserTrade[]; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (params.pool) q.set('pool', lc(params.pool));
  if (params.from !== undefined) q.set('from', String(params.from));
  if (params.to !== undefined) q.set('to', String(params.to));
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  if (params.offset !== undefined) q.set('offset', String(params.offset));
  const qs = q.toString();
  return req(`/users/${lc(address)}/trades${qs ? '?' + qs : ''}`);
}

// ── Portfolio (3.4: single-call net worth + enriched positions) ──

export interface PortfolioPosition extends UserPosition {
  priceWad: U256 | null;
  marketCapUsdl: U256 | null;
  tokenSymbol: string;
  tokenName: string;
  tokenLogo: string | null;
}

export interface PortfolioResponse {
  user: Hex;
  totalValueUsdl: U256;
  positions: PortfolioPosition[];
}

export async function getPortfolio(address: string): Promise<PortfolioResponse> {
  return req(`/users/${lc(address)}/portfolio`);
}

// ── Card mint + hydration ────────────────────────────────────

export interface MintCardInput {
  ownerAddress: string;
  poolAddress: string;
}

/**
 * Mint a PNL share card. No signature required — the backend validates that
 * `(ownerAddress, poolAddress)` has a real position in `pnl.user_positions`
 * (returns 400 otherwise) so garbage mints for wallets that never traded
 * are still rejected.
 */
export async function mintCard(input: MintCardInput): Promise<MintedCard> {
  return req<MintedCard>(`/pnl/cards`, {
    method: 'POST',
    body: JSON.stringify({
      ownerAddress: lc(input.ownerAddress),
      poolAddress: lc(input.poolAddress),
    }),
  });
}

export async function getCard(cardId: string): Promise<MintedCard | null> {
  try {
    return await req<MintedCard>(`/pnl/cards/${cardId}`);
  } catch (e) {
    if (e instanceof PnlApiError && e.status === 404) return null;
    throw e;
  }
}

// ── Referral events ──────────────────────────────────────────

export type PnlEventType = 'click' | 'wallet_bind';

export interface LogEventInput {
  type: PnlEventType;
  walletAddress?: string;
  cardId?: string;
  shortCode?: string;
}

export async function logEvent(input: LogEventInput): Promise<{ ok: boolean }> {
  const body: Record<string, string> = { type: input.type };
  if (input.walletAddress) body.walletAddress = lc(input.walletAddress);
  if (input.cardId) body.cardId = input.cardId;
  if (input.shortCode) body.shortCode = input.shortCode;
  try {
    return await req<{ ok: boolean }>(`/pnl/events`, {
      method: 'POST',
      body: JSON.stringify(body),
      credentials: 'include',
    });
  } catch {
    // fire-and-forget — attribution failures must never break UX
    return { ok: false };
  }
}

// ── Sharer dashboard ─────────────────────────────────────────

export async function getSharerStats(address: string): Promise<SharerStats> {
  return req(`/referrals/${lc(address)}/stats`);
}

// ── Service status ───────────────────────────────────────────

export async function getStatus(): Promise<PnlStatus> {
  return req(`/status`);
}
