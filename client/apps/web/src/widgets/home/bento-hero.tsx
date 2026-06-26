'use client';

import { formatCurrency, formatNumber, safeFixed } from '@/utils/format';
import { useBentoHero, relativeAge } from './use-bento-hero';
import { HeroTile, SpotlightTile, FeedTile, StatTile } from './bento-tiles';

/**
 * BentoHero — home-page above-the-fold layout.
 *
 * Composition only. All data + polling lives in `useBentoHero`, all visual
 * primitives live in `bento-tiles`. Sharing TanStack Query keys with
 * TrendingStrip and GlobalSearch means the trending list fires ONE network
 * request across all three components, not three.
 */
export default function BentoHero() {
  const { trending, topGainer, newest, platform, loading } = useBentoHero();

  const hero = trending[0] ?? null;
  const feedTokens = trending.slice(1, 6);
  const gainerChange = topGainer?.stats?.priceChange24h ? Number(topGainer.stats.priceChange24h) / 100 : 0;
  const newestAge = newest?.stats?.createdAt ? relativeAge(newest.stats.createdAt) : '—';
  const vol24h = platform ? Number(platform.totalVolume24h || 0) / 1e6 : 0;

  if (loading && trending.length === 0) {
    return (
      <div className="px-4">
        <div className="bento-grid gap-3">
          <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[280px]" style={{ gridArea: 'hero' }} />
          <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[120px]" style={{ gridArea: 'spot1' }} />
          <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[120px]" style={{ gridArea: 'spot2' }} />
          <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[280px]" style={{ gridArea: 'feed' }} />
          <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[110px]" style={{ gridArea: 'stat1' }} />
          <div className="rounded-2xl bg-dark-gray4/60 animate-pulse min-h-[110px]" style={{ gridArea: 'stat2' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4">
      <div className="bento-grid gap-3">
        <HeroTile token={hero} />

        <SpotlightTile
          token={topGainer}
          label="Top Gainer"
          labelColor="pink"
          gridArea="spot1"
          metricLabel="24h"
          metricValue={`${gainerChange >= 0 ? '+' : ''}${safeFixed(gainerChange, 1)}%`}
          metricTone={gainerChange >= 0 ? 'green' : 'red'}
        />

        <SpotlightTile
          token={newest}
          label="Just Launched"
          labelColor="cyan"
          gridArea="spot2"
          metricLabel="Age"
          metricValue={newestAge}
          metricTone="neutral"
        />

        <FeedTile tokens={feedTokens} />

        <StatTile
          label="Volume 24h"
          value={formatCurrency(vol24h, 1)}
          sublabel={platform ? `${formatNumber(platform.uniqueTraders24h, 0)} traders` : undefined}
          gridArea="stat1"
          accent="green"
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="8" width="2.5" height="5" rx="0.5" fill="currentColor" />
              <rect x="5.25" y="5" width="2.5" height="8" rx="0.5" fill="currentColor" />
              <rect x="9.5" y="1" width="2.5" height="12" rx="0.5" fill="currentColor" />
            </svg>
          }
        />

        <StatTile
          label="Tokens"
          value={platform ? String(platform.totalTokensLaunched) : '—'}
          sublabel={platform ? `+${platform.newTokens24h} in 24h` : undefined}
          gridArea="stat2"
          accent="pink"
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 4.5V9.5M4.5 7H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
