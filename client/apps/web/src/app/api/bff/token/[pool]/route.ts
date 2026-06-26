import { NextRequest, NextResponse } from 'next/server';

/**
 * 4.1: BFF aggregation endpoint for token detail pages.
 *
 * GET /api/bff/token/:poolAddress
 *
 * Aggregates data from multiple backend services in a single request:
 *   - stats service: pool stats (price, volume, holders, risk)
 *   - stats service: top holders
 *   - metadata service: token metadata (name, symbol, logo, description)
 *   - stats service: pressure (buy/sell 1h/24h)
 *   - stats service: reactions
 *
 * This eliminates 5+ sequential client-side fetches and reduces round trips.
 */

const SERVICE_MAP: Record<string, string> = {
  stats: process.env.NEXT_PUBLIC_STATS_API || 'https://statsmicroservice-production.up.railway.app',
  metadata: process.env.NEXT_PUBLIC_METADATA_API || 'https://metadata-production-ae57.up.railway.app',
};

type RouteParams = { params: Promise<{ pool: string }> };

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { next: { revalidate: 5 } });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { pool } = await params;

  if (!pool || pool.length !== 42) {
    return NextResponse.json({ error: 'Invalid pool address' }, { status: 400 });
  }

  const statsBase = SERVICE_MAP.stats;
  const metadataBase = SERVICE_MAP.metadata;

  // Parallel fetch from all services
  const [stats, holders, pressure, reactions] = await Promise.all([
    safeFetch(`${statsBase}/stats/${pool}`, null),
    safeFetch(`${statsBase}/stats/${pool}/holders?limit=10`, { holders: [] }),
    safeFetch(`${statsBase}/stats/${pool}/pressure`, null),
    safeFetch(`${statsBase}/stats/${pool}/reactions`, { reactions: {} }),
  ]);

  // Metadata needs tokenAddress from stats
  const tokenAddress = (stats as Record<string, unknown> | null)?.tokenAddress;
  const metadata = tokenAddress
    ? await safeFetch(`${metadataBase}/metadata/${tokenAddress}.json`, null)
    : null;

  const response = {
    pool,
    stats,
    holders: (holders as Record<string, unknown> | null)?.holders ?? [],
    metadata,
    pressure,
    reactions: (reactions as Record<string, unknown> | null)?.reactions ?? {},
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
    },
  });
}
