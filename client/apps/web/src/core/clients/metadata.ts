/**
 * Metadata service client — metadata.kindlelaunch.com (media/metadata).
 *
 * Provides a single network-aware fetcher for token metadata. Uses the
 * batch endpoint (`GET /metadata/batch?addresses=...`) when available,
 * falls back to per-token requests when the backend is older than the
 * batch endpoint deploy.
 *
 * - Caps requests at 100 addresses per call (matches backend MAX_BATCH).
 * - Deduplicates and lowercases input.
 * - Coalesces concurrent fetches for the same set of misses through an
 *   in-memory inflight map so a burst of consumers triggers ONE request.
 * - Returns a map keyed by lowercased address. Missing/404 entries are
 *   stored as `null`.
 */

import { metadataApiUrl } from '@/core/sdk-config';
import { reportError } from '@/core/report-error';
import type { TokenMetadata } from '@/widgets/home/types';

// Backend cap. If we're asked for more, chunk client-side.
export const METADATA_BATCH_LIMIT = 100;

type MaybeMeta = TokenMetadata | null;

// ── Internal: inflight de-duplication ─────────────────────────────

const inflight = new Map<string, Promise<MaybeMeta>>();

/**
 * Normalize, dedup, lowercase. Drops anything that doesn't look like an
 * EVM address. Order preserved.
 */
function normalizeAddresses(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    if (typeof raw !== 'string') continue;
    const a = raw.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(a)) continue;
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length <= size) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ── Single fetch (kept for fallback + standalone usage) ───────────

export async function fetchTokenMetadata(
  tokenAddress: string,
  signal?: AbortSignal,
): Promise<MaybeMeta> {
  const addr = tokenAddress.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) return null;

  const existing = inflight.get(addr);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(metadataApiUrl(`/metadata/${addr}`), { signal });
      if (!res.ok) return null;
      return (await res.json()) as TokenMetadata;
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        reportError(err, { area: 'metadata-client', addr });
      }
      return null;
    } finally {
      inflight.delete(addr);
    }
  })();

  inflight.set(addr, promise);
  return promise;
}

// ── Batch fetch ────────────────────────────────────────────────────

/**
 * Whether the metadata service supports `/metadata/batch`. Set to false
 * after a 404 so subsequent calls go straight to per-token fetches.
 * Re-checked once per session.
 */
let batchEndpointSupported: boolean | null = null;

async function fetchBatchOnce(
  addresses: string[],
  signal?: AbortSignal,
): Promise<Record<string, MaybeMeta>> {
  if (addresses.length === 0) return {};

  // ── Try the batch endpoint first ──
  if (batchEndpointSupported !== false) {
    try {
      const url = metadataApiUrl(
        `/metadata/batch?addresses=${encodeURIComponent(addresses.join(','))}`,
      );
      const res = await fetch(url, { signal });
      if (res.ok) {
        batchEndpointSupported = true;
        const data = (await res.json()) as Record<string, MaybeMeta>;
        // Ensure every requested address has a key, even if backend
        // dropped it (shouldn't happen, but defensive).
        const out: Record<string, MaybeMeta> = {};
        for (const a of addresses) out[a] = data[a] ?? null;
        return out;
      }
      if (res.status === 404) {
        batchEndpointSupported = false; // older backend → fall through
      } else {
        // 4xx/5xx other than 404 — treat as transient, fall back this
        // call but keep trying the batch endpoint next time.
        return fallbackPerToken(addresses, signal);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return {};
      }
      // Network error: don't permanently disable the batch endpoint,
      // just fall back for this call.
      return fallbackPerToken(addresses, signal);
    }
  }

  return fallbackPerToken(addresses, signal);
}

async function fallbackPerToken(
  addresses: string[],
  signal?: AbortSignal,
): Promise<Record<string, MaybeMeta>> {
  const results = await Promise.all(
    addresses.map((a) => fetchTokenMetadata(a, signal)),
  );
  const out: Record<string, MaybeMeta> = {};
  addresses.forEach((a, i) => {
    out[a] = results[i];
  });
  return out;
}

/**
 * Fetch metadata for many tokens. Returns a map keyed by lowercased
 * address; missing tokens map to `null`.
 *
 * - Order-independent.
 * - Deduplicates input.
 * - Splits requests over METADATA_BATCH_LIMIT.
 * - Returns `{}` for empty / all-invalid input.
 *
 * Use `useTokenMetadataBatch` from `hooks/market/use-token-metadata.ts`
 * inside React components — it wraps this and seeds the per-address
 * React Query cache so individual `useTokenMetadata(addr)` calls in
 * children don't refetch.
 */
export async function fetchTokenMetadataBatch(
  addresses: string[],
  signal?: AbortSignal,
): Promise<Record<string, MaybeMeta>> {
  const normalized = normalizeAddresses(addresses);
  if (normalized.length === 0) return {};

  const groups = chunk(normalized, METADATA_BATCH_LIMIT);
  const merged: Record<string, MaybeMeta> = {};

  for (const group of groups) {
    const part = await fetchBatchOnce(group, signal);
    Object.assign(merged, part);
  }

  return merged;
}
