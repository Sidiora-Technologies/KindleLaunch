'use client';

import { useState } from 'react';
import TrendingStrip from '@/widgets/home/trending-strip';
import CategoryTabs, { type RankingCategory } from '@/widgets/home/category-tabs';
import TokenGrid from '@/widgets/home/token-grid';
import WatchlistGrid from '@/widgets/home/watchlist-grid';

type ViewMode = 'explore' | 'watchlist';

export default function HomeModule() {
  const [category, setCategory] = useState<RankingCategory>('breakout');
  const [view, setView] = useState<ViewMode>('explore');

  return (
    <div className="py-4 text-white">
      {/* Trending board */}
      <div className="px-4 mb-2.5 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-middle animate-pulse" />
        <h2 className="text-size-12 font-manrope-extra-bold text-white uppercase tracking-wider">Trending</h2>
      </div>
      <div className="mb-5">
        <TrendingStrip />
      </div>

      {/* Sort / filter bar (sticky under the header) */}
      <div className="sticky top-[52px] sm:top-[64px] z-30 bg-black-gray/95 backdrop-blur-sm py-2.5 mb-3">
        <div className="px-4 flex items-center gap-3 flex-wrap">
          <CategoryTabs active={category} onChange={(c) => { setCategory(c); setView('explore'); }} />

          <span className="w-px h-4 bg-dark-gray6 mx-1 hidden sm:block" />

          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('explore')}
              className={`text-size-12 font-manrope-bold pb-0.5 transition ${
                view === 'explore'
                  ? 'text-white border-b-2 border-green-middle'
                  : 'text-dark-disabled hover:text-half-enabled'
              }`}
            >
              Explore
            </button>
            <button
              onClick={() => setView('watchlist')}
              className={`text-size-12 font-manrope-bold pb-0.5 transition ${
                view === 'watchlist'
                  ? 'text-white border-b-2 border-green-middle'
                  : 'text-dark-disabled hover:text-half-enabled'
              }`}
            >
              Watchlist
            </button>
          </div>
        </div>
      </div>

      {view === 'explore' ? (
        <TokenGrid category={category} />
      ) : (
        <WatchlistGrid />
      )}
    </div>
  );
}
