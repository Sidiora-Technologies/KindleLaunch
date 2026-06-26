'use client';

import { useCallback, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTrendingStrip } from './use-trending-strip';
import TrendingCard from './trending-card';

/**
 * TrendingStrip — composition only. Data + buy-flash logic in
 * `useTrendingStrip` (React Query, dedup with BentoHero/GlobalSearch).
 * Card visuals in `trending-card`.
 * Enhanced with smooth scroll indicators and Apple-style nav buttons.
 */
export default function TrendingStrip() {
  const { cards, loading, flashKeys, litPools, scrollRef, scroll } = useTrendingStrip(8);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) {
      setScrollProgress(0);
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const progress = el.scrollLeft / maxScroll;
    setScrollProgress(progress);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxScroll - 4);
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [scrollRef, updateScrollState, cards.length]);

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="min-w-[200px] h-[170px] rounded-xl bg-dark-gray animate-pulse flex-shrink-0" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return <div className="px-4 py-3 text-dark-disabled text-size-12">No trending tokens yet.</div>;
  }

  return (
    <div className="relative group">
      <AnimatePresence>
        {canScrollLeft && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            onClick={() => scroll('left')}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-dark-gray4/95 border border-dark-gray6/50 flex items-center justify-center backdrop-blur-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-dark-gray7 active:scale-90"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7L9 11" stroke="#A8AFC1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {canScrollRight && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            onClick={() => scroll('right')}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-dark-gray4/95 border border-dark-gray6/50 flex items-center justify-center backdrop-blur-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-dark-gray7 active:scale-90"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L9 7L5 11" stroke="#A8AFC1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </motion.button>
        )}
      </AnimatePresence>

      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 px-4 scrollbar-none scroll-smooth">
        <AnimatePresence initial={false}>
          {cards.map((c) => {
            const addr = c.poolAddress.toLowerCase();
            return (
              <TrendingCard
                key={c.poolAddress}
                card={c}
                isLit={litPools.has(addr)}
                flashKey={flashKeys[addr] ?? 0}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Scroll progress indicator */}
      {cards.length > 3 && (
        <div className="flex justify-center mt-2 px-4">
          <div className="w-16 h-0.5 rounded-full bg-dark-gray overflow-hidden">
            <motion.div
              className="h-full bg-half-enabled/60 rounded-full"
              animate={{ width: `${Math.max(25, 100 / (cards.length / 3))}%`, x: `${scrollProgress * (100 - Math.max(25, 100 / (cards.length / 3)))}%` }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
