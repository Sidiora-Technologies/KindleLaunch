'use client';

import { motion } from 'framer-motion';
import { formatAddress, formatCurrency, from6dec } from '@/utils/format';
import type { HotCoin, RecentItem, SearchResult } from './use-global-search';
import { relAge } from './use-global-search';
import { SearchResultSkeleton } from '@/ui/shared/skeletons';

interface SelectArgs {
  poolAddress: string | undefined;
  tokenAddress: string | undefined;
  name: string;
  symbol: string;
  logo: string | null;
  marketCap: string;
}

// ── Idle dropdown (hot coins + recent viewed) ─────────────────────────────────

interface SearchIdlePanelProps {
  hotCoins: HotCoin[];
  recentViewed: RecentItem[];
  onSelect: (args: SelectArgs) => void;
  onClearRecent: () => void;
}

export function SearchIdlePanel({ hotCoins, recentViewed, onSelect, onClearRecent }: SearchIdlePanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="absolute top-full left-0 right-0 mt-1.5 bg-black-gray/95 backdrop-blur-xl border border-dark-gray/60 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden"
      style={{ minWidth: 380 }}
    >
      {hotCoins.length > 0 && (
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-size-10 text-dark-disabled font-manrope-bold uppercase tracking-wider">Trending Now</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {hotCoins.slice(0, 5).map((coin, i) => (
              <motion.button
                key={coin.poolAddress}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  onSelect({
                    poolAddress: coin.poolAddress,
                    tokenAddress: coin.tokenAddress,
                    name: coin.name || '',
                    symbol: coin.symbol || '',
                    logo: coin.logo || null,
                    marketCap: coin.marketCap || '0',
                  })
                }
                className="flex-shrink-0 w-[92px] border border-dark-gray/50 rounded-xl p-2.5 hover:bg-dark-gray2/50 hover:border-dark-gray transition-all text-center group/coin"
              >
                <div className="w-8 h-8 mx-auto rounded-full bg-dark-gray overflow-hidden flex items-center justify-center mb-1.5 ring-1 ring-dark-gray/50 group-hover/coin:ring-dark-gray6/50 transition">
                  {coin.logo ? (
                    <img src={coin.logo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-size-8 text-dark-disabled font-manrope-bold">{(coin.symbol || '?').slice(0, 2)}</span>
                  )}
                </div>
                <div className="text-size-10 font-manrope-bold text-white truncate">{coin.symbol || coin.name || '?'}</div>
                <div className="text-size-9 text-dark-disabled truncate">{coin.name || ''}</div>
                <div className="text-size-10 font-manrope-bold text-half-enabled mt-0.5">
                  {formatCurrency(from6dec(coin.marketCap))}
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {recentViewed.length > 0 && (
        <div className="border-t border-dark-gray/40">
          <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-dark-disabled">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1" />
                <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
              <span className="text-size-10 text-dark-disabled font-manrope-bold uppercase tracking-wider">Recent</span>
            </div>
            <button
              onClick={onClearRecent}
              className="text-size-10 text-dark-disabled hover:text-half-enabled transition px-1.5 py-0.5 rounded hover:bg-dark-gray2/50"
            >
              Clear all
            </button>
          </div>
          {recentViewed.map((item, i) => (
            <motion.button
              key={item.address}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() =>
                onSelect({
                  poolAddress: item.address,
                  tokenAddress: undefined,
                  name: item.name,
                  symbol: item.symbol,
                  logo: item.logo,
                  marketCap: item.marketCap,
                })
              }
              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-dark-gray2/40 transition text-left group/recent"
            >
              <div className="w-7 h-7 rounded-full bg-dark-gray overflow-hidden flex-shrink-0 flex items-center justify-center ring-1 ring-dark-gray/50">
                {item.logo ? (
                  <img src={item.logo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-size-9 text-dark-disabled font-manrope-bold">{item.symbol.slice(0, 2)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-size-12 font-manrope-bold text-white truncate group-hover/recent:text-emerald-300 transition">{item.name}</span>
                  <span className="text-size-10 text-dark-disabled">{item.symbol}</span>
                </div>
                <span className="text-size-9 text-dark-disabled">{formatAddress(item.address, 4)}</span>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-size-11 font-manrope-bold text-white">{formatCurrency(from6dec(item.marketCap))}</div>
                <div className="text-size-9 text-dark-disabled">{relAge(item.ts)}</div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {hotCoins.length === 0 && recentViewed.length === 0 && (
        <div className="px-4 py-8 text-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto mb-2 text-dark-disabled/50">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16 16L20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="text-size-11 text-dark-disabled">Start typing to search tokens</div>
          <div className="text-size-10 text-dark-disabled/50 mt-1">Search by name, symbol, or address</div>
        </div>
      )}
    </motion.div>
  );
}

// ── Results dropdown ─────────────────────────────────────────────────────────

interface SearchResultsListProps {
  results: SearchResult[];
  loading: boolean;
  onSelect: (args: SelectArgs) => void;
}

export function SearchResultsList({ results, loading, onSelect }: SearchResultsListProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="absolute top-full left-0 right-0 mt-1.5 bg-black-gray/95 backdrop-blur-xl border border-dark-gray/60 rounded-xl shadow-2xl shadow-black/40 z-50 max-h-[420px] overflow-y-auto scrollbar-none"
      style={{ minWidth: 380 }}
    >
      {loading && results.length === 0 && (
        <div className="p-1">
          <SearchResultSkeleton />
        </div>
      )}
      {!loading && results.length === 0 && (
        <div className="px-4 py-8 text-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto mb-2 text-dark-disabled/40">
            <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <div className="text-size-11 text-dark-disabled">No results found</div>
          <div className="text-size-10 text-dark-disabled/50 mt-1">Try a different search term</div>
        </div>
      )}
      {results.map((r, i) => {
        const addr = r.pool_address || r.token_address || '';
        return (
          <motion.button
            key={addr || i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() =>
              onSelect({
                poolAddress: r.pool_address,
                tokenAddress: r.token_address,
                name: r.name || r.symbol || '',
                symbol: r.symbol || '',
                logo: r.images?.logo || null,
                marketCap: r.marketCap || '0',
              })
            }
            className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-dark-gray2/40 transition text-left border-b border-dark-gray/20 last:border-0 group/result"
          >
            <div className="w-9 h-9 rounded-full bg-dark-gray overflow-hidden flex-shrink-0 flex items-center justify-center ring-1 ring-dark-gray/50 group-hover/result:ring-dark-gray6/50 transition">
              {r.images?.logo ? (
                <img src={r.images.logo} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-size-10 text-dark-disabled font-manrope-bold">
                  {(r.symbol || r.name || '?').slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-size-12 font-manrope-bold text-white truncate group-hover/result:text-emerald-300 transition">{r.name || r.symbol || 'Unknown'}</span>
                {r.symbol && <span className="text-size-10 text-dark-disabled">{r.symbol}</span>}
              </div>
              <span className="text-size-9 text-dark-disabled font-mono">{formatAddress(addr, 6)}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {r.marketCap && r.marketCap !== '0' && (
                <span className="text-size-11 font-manrope-bold text-half-enabled">
                  {formatCurrency(from6dec(r.marketCap))}
                </span>
              )}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-dark-disabled opacity-0 group-hover/result:opacity-100 transition">
                <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

// ── Input field ──────────────────────────────────────────────────────────────

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  inputRef: React.Ref<HTMLInputElement>;
}

export function SearchInput({ value, onChange, onFocus, inputRef }: SearchInputProps) {
  return (
    <div className="relative flex items-center group/search">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="absolute left-3 text-dark-disabled group-focus-within/search:text-half-enabled transition pointer-events-none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder="Search tokens..."
        className="w-full bg-dark-gray2/80 border border-dark-gray/60 rounded-xl pl-9 pr-16 py-2 text-size-12 text-white outline-none focus:border-dark-gray6/80 focus:bg-dark-gray2 focus:shadow-lg focus:shadow-black/20 transition-all placeholder:text-dark-disabled"
      />
      <div className="absolute right-3 flex items-center gap-1 pointer-events-none">
        <kbd className="px-1.5 py-0.5 text-size-9 text-dark-disabled/60 bg-dark-gray/50 rounded-md font-mono border border-dark-gray/30">⌘K</kbd>
      </div>
    </div>
  );
}
