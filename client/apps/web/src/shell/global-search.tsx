'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { sdkBaseUrls } from '@/core/sdk-config';
import { reportError } from '@/core/report-error';
import {
  useHotCoins,
  useSearchResults,
  useRecentViewed,
  type RecentItem,
} from './use-global-search';
import { SearchInput, SearchIdlePanel, SearchResultsList } from './global-search-parts';

interface SelectArgs {
  poolAddress: string | undefined;
  tokenAddress: string | undefined;
  name: string;
  symbol: string;
  logo: string | null;
  marketCap: string;
}

/**
 * GlobalSearch — composition only.
 * Hot coins, search results, and recent-viewed are all in `useGlobalSearch`
 * via React Query (shares trending cache with BentoHero / TrendingStrip).
 * Visual primitives live in `global-search-parts`.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { coins: hotCoins } = useHotCoins(8);
  const { data: results = [], isLoading: searching } = useSearchResults(query);
  const { recent, refresh, clear, push } = useRecentViewed();

  // ── Click outside / keyboard shortcuts ─────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleFocus = useCallback(() => {
    setOpen(true);
    refresh();
  }, [refresh]);

  const handleSelect = useCallback(async (args: SelectArgs) => {
    let navAddr = args.poolAddress || '';
    if (!navAddr && args.tokenAddress) {
      try {
        const res = await fetch(`${sdkBaseUrls.metadata}/metadata/${args.tokenAddress}.json`);
        if (res.ok) {
          const meta = await res.json();
          if (meta?.pool_address) navAddr = meta.pool_address;
        }
      } catch (error) {
        reportError(error, { area: 'global-search', action: 'resolveNavAddress' });
      }
    }
    if (!navAddr) navAddr = args.tokenAddress || '';
    if (!navAddr) return;

    push({
      address: navAddr,
      name: args.name,
      symbol: args.symbol,
      logo: args.logo,
      marketCap: args.marketCap,
      ts: Date.now(),
    } as RecentItem);
    router.push(`/token/${navAddr}`);
    setOpen(false);
    setQuery('');
  }, [push, router]);

  const showIdle = open && query.length < 2;
  const showResults = open && query.length >= 2;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <SearchInput
        value={query}
        onChange={(v) => { setQuery(v); setOpen(true); }}
        onFocus={handleFocus}
        inputRef={inputRef}
      />

      {showIdle && (
        <SearchIdlePanel
          hotCoins={hotCoins}
          recentViewed={recent}
          onSelect={handleSelect}
          onClearRecent={clear}
        />
      )}

      {showResults && (
        <SearchResultsList
          results={results}
          loading={searching}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
