'use client';

import { useState } from 'react';
import BentoHero from '@/widgets/home/bento-hero';
import CategoryTabs, { type RankingCategory } from '@/widgets/home/category-tabs';
import TokenGrid from '@/widgets/home/token-grid';
import WatchlistGrid from '@/widgets/home/watchlist-grid';

type ViewMode = 'explore' | 'watchlist';

export default function HomeModule() {
  const [category, setCategory] = useState<RankingCategory>('breakout');
  const [view, setView] = useState<ViewMode>('explore');

  return (
    <div className="py-5 text-white">
      <div className="mb-5">
        <BentoHero />
      </div>

      <div className="px-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <CategoryTabs active={category} onChange={(c) => { setCategory(c); setView('explore'); }} />

          <div className="border-l border-dark-gray h-4 mx-1 hidden sm:block" />

          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('explore')}
              className={`text-size-12 font-manrope-bold transition border-b ${
                view === 'explore'
                  ? 'text-white border-green-middle'
                  : 'text-dark-disabled border-transparent hover:text-half-enabled'
              }`}
            >
              Explore
            </button>
            <button
              onClick={() => setView('watchlist')}
              className={`text-size-12 font-manrope-bold transition border-b ${
                view === 'watchlist'
                  ? 'text-white border-green-middle'
                  : 'text-dark-disabled border-transparent hover:text-half-enabled'
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
