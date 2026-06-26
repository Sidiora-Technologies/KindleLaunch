/**
 * token-universe.ts — Meta-AG token list builder.
 *
 * Combines the canonical Meta-AG quote tokens (USDL + WPAX, both 18-dec
 * and registered with the PECORVault per `_meta_pecor.wiringDone`) with
 * the dynamic launchpad token list pulled from the ranking SDK.
 *
 * Decimals are NOT hardcoded — for unknown tokens the swap panel reads
 * `decimals()` on-chain at the call site. The launchpad tokens are
 * always 6-dec (factory default), but USDL/WPAX live on the meta-ag
 * vault and use 18-dec.
 */
import { sdkBaseUrls } from '@/core/sdk-config';
import { fetchTokenMetadataBatch } from '@/core/clients/metadata';
import {
  META_AG_USDL_ADDRESS,
  META_AG_WPAX_ADDRESS,
} from '@/core/clients/meta-ag';
import type {
  RankingItem,
  PoolStats,
  TokenMetadata,
} from '@/widgets/home/types';

export interface MetaAgToken {
  /** Lowercased ERC20 address — used as canonical key. */
  tokenAddress: `0x${string}`;
  /** Pool address on the launchpad, if any (null for USDL/WPAX). */
  poolAddress: `0x${string}` | null;
  name: string;
  symbol: string;
  logo: string | null;
  decimals: number;
  /** USD price (18-dec normalised → number). 0 if unknown. */
  price: number;
  /** Market cap in USD (number). 0 if unknown. */
  marketCap: number;
  /**
   * `quote` = canonical quote token (USDL, WPAX). Always shown first
   * in the selector and used as the default in/out pair.
   * `launchpad` = bonded token via the legacy Sidiora launchpad.
   */
  kind: 'quote' | 'launchpad';
}

const QUOTE_TOKENS: MetaAgToken[] = [
  {
    tokenAddress: META_AG_USDL_ADDRESS.toLowerCase() as `0x${string}`,
    poolAddress: null,
    name: 'USD Liquid',
    symbol: 'USDL',
    logo: '/usdl-logo.png',
    decimals: 18,
    price: 1,
    marketCap: 0,
    kind: 'quote',
  },
  {
    tokenAddress: META_AG_WPAX_ADDRESS.toLowerCase() as `0x${string}`,
    poolAddress: null,
    name: 'Wrapped PAX',
    symbol: 'WPAX',
    logo: '/wpax-logo.png',
    decimals: 18,
    price: 0,
    marketCap: 0,
    kind: 'quote',
  },
];

export async function loadMetaAgTokens(
  signal?: AbortSignal,
): Promise<MetaAgToken[]> {
  // Always include the canonical quote tokens up front so the selector
  // works even when the ranking SDK is offline.
  const tokens: MetaAgToken[] = [...QUOTE_TOKENS];

  try {
    const rankingRes = await fetch(
      `${sdkBaseUrls.ranking}/rankings/trending?limit=200&offset=0`,
      { signal },
    );
    if (!rankingRes.ok) return tokens;
    const rankingData = await rankingRes.json();
    const items: RankingItem[] = rankingData.items ?? [];
    if (items.length === 0) return tokens;

    const poolAddrs = items.map((i) => i.poolAddress);
    const statsRes = await fetch(
      `${sdkBaseUrls.stats}/stats/batch?pools=${poolAddrs.join(',')}`,
      { signal },
    );
    let statsMap: Record<string, PoolStats> = {};
    if (statsRes.ok) statsMap = await statsRes.json();

    // ONE batch request via the metadata client (replaces N parallel
    // per-token fetches; falls back transparently if the batch endpoint
    // isn't deployed yet).
    const tokenAddrs = poolAddrs.map(
      (poolAddr) => statsMap[poolAddr]?.tokenAddress || poolAddr,
    );
    const metaByToken = await fetchTokenMetadataBatch(tokenAddrs, signal);

    poolAddrs.forEach((poolAddr, i) => {
      const stats = statsMap[poolAddr];
      const tokenAddr = tokenAddrs[i];
      const meta: TokenMetadata | null = metaByToken[tokenAddr.toLowerCase()] ?? null;
      if (!stats?.tokenAddress) return;
      // De-dupe against the quote tokens (USDL/WPAX may appear in the
      // ranking feed if listed there; we want the curated entry to win).
      const tokenAddrLower = stats.tokenAddress.toLowerCase();
      if (tokens.some((t) => t.tokenAddress === tokenAddrLower)) return;

      const price = stats.price ? Number(stats.price) / 1e18 : 0;
      const mc = stats.marketCap ? Number(stats.marketCap) / 1e6 : 0;
      tokens.push({
        tokenAddress: tokenAddrLower as `0x${string}`,
        poolAddress: poolAddr as `0x${string}`,
        name: meta?.name || `Token ${poolAddr.slice(0, 6)}`,
        symbol: meta?.symbol || '???',
        logo: meta?.images?.logo || null,
        // Launchpad tokens are 6-dec by factory contract.
        decimals: 6,
        price,
        marketCap: mc,
        kind: 'launchpad',
      });
    });
  } catch (err) {
    if ((err as DOMException)?.name !== 'AbortError') {
       
      console.warn('meta-ag: token universe load partial failure:', err);
    }
  }

  return tokens;
}
