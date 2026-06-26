import { describe, it, expect } from 'vitest';
import {
  fromWad,
  from6dec,
  formatPrice,
  formatCurrency,
  formatNumber,
  formatPercent,
} from './format';

/**
 * Behavior-pinning tests for the money formatters.
 *
 * These lock the CURRENT (Number/float-based) behavior of the formatting
 * utilities as a safety net BEFORE the Phase-1 BigInt/decimal precision
 * refactor. They intentionally assert the existing float semantics — including
 * its sub-cent float-noise — so the refactor surfaces every behavioral change
 * instead of silently shifting displayed prices/balances.
 *
 * Real `format.ts` functions are exercised directly; nothing is mocked.
 */

describe('fromWad (18-decimal wei -> number)', () => {
  it('returns 0 for empty/null/undefined/zero', () => {
    expect(fromWad(undefined)).toBe(0);
    expect(fromWad(null)).toBe(0);
    expect(fromWad('')).toBe(0);
    expect(fromWad('0')).toBe(0);
    expect(fromWad(0)).toBe(0);
  });

  it('converts whole-unit wei amounts', () => {
    expect(fromWad('1000000000000000000')).toBe(1);
    expect(fromWad('1500000000000000000')).toBe(1.5);
    expect(fromWad('2000000000000000000')).toBe(2);
  });

  it('converts sub-unit wei amounts (length <= 18)', () => {
    expect(fromWad('500000000000000000')).toBe(0.5);
  });

  it('converts large multi-digit integer parts', () => {
    expect(fromWad('123000000000000000000')).toBe(123);
  });
});

describe('from6dec (6-decimal -> number)', () => {
  it('returns 0 for empty/null/undefined/zero', () => {
    expect(from6dec(undefined)).toBe(0);
    expect(from6dec(null)).toBe(0);
    expect(from6dec('')).toBe(0);
    expect(from6dec('0')).toBe(0);
  });

  it('converts whole-unit amounts', () => {
    expect(from6dec('1000000')).toBe(1);
    expect(from6dec('1500000')).toBe(1.5);
  });

  it('converts sub-unit amounts (length <= 6)', () => {
    expect(from6dec('500000')).toBe(0.5);
    expect(from6dec('123')).toBe(0.000123);
  });
});

describe('formatCurrency', () => {
  it('formats plain values under 1000', () => {
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(12.5)).toBe('$12.50');
    expect(formatCurrency(null)).toBe('$0.00');
    expect(formatCurrency(undefined)).toBe('$0.00');
  });

  it('abbreviates thousands / millions / billions', () => {
    expect(formatCurrency(1500)).toBe('$1.50K');
    expect(formatCurrency(1500000)).toBe('$1.50M');
    expect(formatCurrency(1234567890)).toBe('$1.23B');
  });

  it('coerces numeric strings', () => {
    expect(formatCurrency('1234.5')).toBe('$1.23K');
  });
});

describe('formatNumber', () => {
  it('abbreviates without a currency prefix', () => {
    expect(formatNumber(999)).toBe('999.00');
    expect(formatNumber(1500)).toBe('1.50K');
    expect(formatNumber(1500000)).toBe('1.50M');
  });
});

describe('formatPercent', () => {
  it('adds an explicit sign', () => {
    expect(formatPercent(1.234)).toBe('+1.23%');
    expect(formatPercent(-1.234)).toBe('-1.23%');
    expect(formatPercent(0)).toBe('+0.00%');
  });
});

describe('formatPrice', () => {
  it('formats zero and values >= 1', () => {
    expect(formatPrice(0)).toBe('$0.00');
    expect(formatPrice(1)).toBe('$1.00');
    expect(formatPrice(2.5)).toBe('$2.50');
  });

  it('formats values between 0.01 and 1 with 4 decimals', () => {
    expect(formatPrice(0.05)).toBe('$0.0500');
    expect(formatPrice(0.123)).toBe('$0.1230');
  });

  it('accepts a wei string and converts via fromWad', () => {
    expect(formatPrice('1000000000000000000')).toBe('$1.00');
    expect(formatPrice('2500000000000000000')).toBe('$2.50');
  });

  it('renders tiny sub-cent prices (4 leading zeros or fewer) inline', () => {
    expect(formatPrice(0.001)).toBe('$0.001');
  });

  it('renders very tiny sub-cent prices with subscript leading-zero count', () => {
    const out = formatPrice(0.0000123);
    // Subscript-4 form: "$0.0" + subscript count of leading zeros + sig digits.
    expect(out.startsWith('$0.0')).toBe(true);
    expect(out).toContain('\u2084'); // subscript "4" = four leading zeros
  });
});
