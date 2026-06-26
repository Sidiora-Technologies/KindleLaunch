'use client';

import { useState, useEffect, useMemo } from "react";
import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatPrice, formatVolume, formatAddress, safeFixed } from "@/utils/format";

const List = () => {
    const trendingTokens = useTerminalStore((s) => s.trendingTokens);
    const batchStats = useTerminalStore((s) => s.batchStats);
    const batchMetadata = useTerminalStore((s) => s.batchMetadata);
    const selectedPool = useTerminalStore((s) => s.selectedPool);
    const selectPool = useTerminalStore((s) => s.selectPool);
    const fetchRankings = useTerminalStore((s) => s.fetchRankings);
    const rankingLoading = useTerminalStore((s) => s.rankingLoading);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchRankings();
    }, [fetchRankings]);

    const filtered = useMemo(() => {
        if (!search.trim()) return trendingTokens;
        const q = search.toLowerCase();
        return trendingTokens.filter(item => {
            const poolStats = batchStats[item.poolAddress] || item.stats;
            const tokenAddr = (poolStats as any)?.tokenAddress || '';
            const meta = tokenAddr ? batchMetadata[tokenAddr] : undefined;
            const name = (meta?.name || '').toLowerCase();
            const symbol = (meta?.symbol || '').toLowerCase();
            const addr = item.poolAddress.toLowerCase();
            return name.includes(q) || symbol.includes(q) || addr.includes(q);
        });
    }, [search, trendingTokens, batchStats, batchMetadata]);

    return (
      <div className="rounded-lg border border-dark-gray overflow-hidden">
        <div className="flex items-center justify-between bg-dark-gray4 border-b border-dark-gray px-2.5 py-1.5">
            <span className="text-pink-middle font-manrope-bold text-size-11">New pairs</span>
            <span className="text-size-9 text-dark-disabled">{trendingTokens.length}</span>
        </div>

        <div className="px-1.5 py-1.5 border-b border-dark-gray">
            <div className="relative">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4B5060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name or address..."
                    className="w-full bg-dark-gray2 border border-dark-gray rounded pl-7 pr-2 py-1.5 text-size-10 text-white outline-none focus:border-pink-middle transition placeholder:text-dark-disabled"
                />
            </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <div className="flex flex-col">
              {rankingLoading && trendingTokens.length === 0 && (
                  <div className="py-4 text-center text-dark-disabled text-size-10 animate-pulse">Loading...</div>
              )}
              {!rankingLoading && filtered.length === 0 && (
                  <div className="py-4 text-center text-dark-disabled text-size-10">
                      {search ? 'No match' : 'No tokens'}
                  </div>
              )}
              {filtered.map((item) => {
                  const poolStats = batchStats[item.poolAddress] || item.stats;
                  const tokenAddr = (poolStats as any)?.tokenAddress || '';
                  const meta = tokenAddr ? batchMetadata[tokenAddr] : undefined;
                  const isSelected = selectedPool === item.poolAddress;
                  const change5m = poolStats?.priceChange5m ? Number(poolStats.priceChange5m) / 100 : 0;
                  const isUp = change5m >= 0;

                  return (
                      <button
                          key={item.poolAddress}
                          onClick={() => { selectPool(item.poolAddress); setSearch(''); }}
                          className={`border-b border-dark-gray/50 py-1.5 px-2.5 text-left transition hover:bg-dark-gray/20 ${
                              isSelected ? 'bg-dark-gray/30 border-l-2 border-l-pink-middle' : ''
                          }`}
                      >
                          <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-dark-gray flex-shrink-0 overflow-hidden">
                                  <img src={meta?.images?.logo || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                      <span className="text-size-11 text-white font-manrope-bold truncate">
                                          {meta?.symbol || formatAddress(item.poolAddress, 3)}
                                      </span>
                                      {meta?.name && (
                                          <span className="text-size-8 text-dark-disabled truncate">{meta.name.length > 12 ? meta.name.slice(0, 10) + '..' : meta.name}</span>
                                      )}
                                  </div>
                                  <div className="flex gap-2 text-size-8 text-dark-disabled">
                                      <span>VOL: <span className="text-green-middle3">{poolStats ? formatVolume((poolStats as any).volume24h) : '---'}</span></span>
                                      <span>MC: <span className="text-white">{poolStats ? formatVolume((poolStats as any).marketCap) : '---'}</span></span>
                                  </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                  <div className="text-size-10 text-white font-manrope-bold">
                                      {poolStats ? formatPrice((poolStats as any).price) : '---'}
                                  </div>
                                  <div className={`text-size-8 font-manrope-bold ${isUp ? 'text-green-middle' : 'text-red-middle'}`}>
                                      {isUp ? '+' : ''}{safeFixed(change5m, 1)}%
                                  </div>
                              </div>
                          </div>
                      </button>
                  );
              })}
          </div>
        </div>
      </div>
    );
  };
  
  export default List;