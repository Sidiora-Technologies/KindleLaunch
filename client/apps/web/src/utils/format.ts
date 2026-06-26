/**
 * (3.9) Formatting utilities. The shared backend package (packages/shared/src/util/format.ts)
 * has BigInt-based formatPrice/formatVolume for server use. This module uses Number-based
 * formatting with subscript digits for client display. Keep both in sync when modifying.
 */

import { formatUnitsExact, formatPriceFromDecimalString } from './units';

export function formatAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/** Safely call .toFixed() on any value — coerces strings/null/undefined to number first. */
export function safeFixed(value: unknown, decimals = 2): string {
  return Number(value ?? 0).toFixed(decimals);
}

export function formatCurrency(value: number | string | undefined | null, decimals = 2): string {
  const v = Number(value ?? 0);
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(decimals)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(decimals)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(decimals)}K`;
  return `$${v.toFixed(decimals)}`;
}

export function formatNumber(value: number | string | undefined | null, decimals = 2): string {
  const v = Number(value ?? 0);
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(decimals)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(decimals)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(decimals)}K`;
  return v.toFixed(decimals);
}

export function formatPercent(value: number | string | undefined | null, decimals = 2): string {
  const v = Number(value ?? 0);
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

const PRICE_DECIMALS = 18;
const AMOUNT_DECIMALS = 6;

export function fromWad(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null || raw === '' || raw === '0') return 0;
  const s = String(raw);
  if (s.length <= PRICE_DECIMALS) return Number('0.' + s.padStart(PRICE_DECIMALS, '0'));
  const intPart = s.slice(0, s.length - PRICE_DECIMALS);
  const fracPart = s.slice(s.length - PRICE_DECIMALS);
  return Number(intPart + '.' + fracPart);
}

export function from6dec(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null || raw === '' || raw === '0') return 0;
  const s = String(raw);
  if (s.length <= AMOUNT_DECIMALS) return Number('0.' + s.padStart(AMOUNT_DECIMALS, '0'));
  const intPart = s.slice(0, s.length - AMOUNT_DECIMALS);
  const fracPart = s.slice(s.length - AMOUNT_DECIMALS);
  return Number(intPart + '.' + fracPart);
}

const SUBSCRIPT_DIGITS = ['\u2080','\u2081','\u2082','\u2083','\u2084','\u2085','\u2086','\u2087','\u2088','\u2089'];

/** Float-based price formatting — used only when the caller already holds a human number. */
function formatPriceFromNumber(val: number): string {
  if (val === 0) return '$0.00';
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(4)}`;
  const s = val.toFixed(20);
  const afterDot = s.slice(2);
  let zeros = 0;
  for (const ch of afterDot) { if (ch === '0') zeros++; else break; }
  const sig = afterDot.slice(zeros, zeros + 4).replace(/0+$/, '');
  if (zeros <= 3) return `$0.${'0'.repeat(zeros)}${sig}`;
  const sub = String(zeros).split('').map(d => SUBSCRIPT_DIGITS[Number(d)] ?? d).join('');
  return `$0.0${sub}${sig}`;
}

/**
 * Format a token price as USD. When given a RAW 18-decimal wad string, the value
 * is formatted EXACTLY from the integer string (BigInt path) so very small
 * prices never lose significant digits to float rounding (D2). A `number` input
 * is treated as an already-human price and formatted via the float path.
 */
export function formatPrice(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null || raw === '') return '$0.00';
  if (typeof raw === 'number') return formatPriceFromNumber(raw);
  return formatPriceFromDecimalString(formatUnitsExact(raw, PRICE_DECIMALS));
}

export function formatVolume(raw: string | number | undefined | null): string {
  return formatCurrency(from6dec(raw));
}

export function formatTokenAmount(raw: string | number | undefined | null, dp = 2): string {
  return formatNumber(from6dec(raw), dp);
}
