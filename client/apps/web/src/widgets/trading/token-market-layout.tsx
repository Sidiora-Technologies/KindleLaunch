'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import PremiumErrorBoundary from '@/ui/shared/premium-error-boundary';
import CommunityReactions from '@/widgets/trading/community-reactions';
import HeaderBar from '@/widgets/trading/header-bar';
import MarketCapDisplay from '@/widgets/trading/market-cap-display';
import StatsStrip from '@/widgets/trading/stats-strip';
import TokenDescription from '@/widgets/trading/token-description';
import TradePanel from '@/widgets/trading/trade-panel';
import MobileTradeDrawer from '@/widgets/trading/mobile-trade-drawer';
import CreatorCard from '@/widgets/trading/creator-card';
import TokenBanner from '@/widgets/trading/token-banner';
import ChatNotifySection from '@/widgets/trading/chat-notify-section';
import CandlePressure from '@/widgets/trading/candle-pressure';

// Heavy / below-the-fold components — dynamically imported
const TvChart = dynamic(() => import('@/widgets/trading/tv-chart'), {
  loading: () => <div className="h-[400px] rounded-xl bg-dark-gray animate-pulse" />,
  ssr: false,
});
const LiveStream = dynamic(() => import('@/widgets/trading/live-stream'), {
  loading: () => <div className="h-[200px] rounded-xl bg-dark-gray animate-pulse" />,
  ssr: false,
});
const PoolChat = dynamic(() => import('@/widgets/trading/pool-chat'), {
  loading: () => <div className="h-[300px] rounded-xl bg-dark-gray animate-pulse" />,
  ssr: false,
});
const RiskPanel = dynamic(() => import('@/widgets/trading/risk-panel'), {
  loading: () => <div className="h-[120px] rounded-xl bg-dark-gray animate-pulse" />,
});
const WhalesPanel = dynamic(() => import('@/widgets/trading/whales-panel'), {
  loading: () => <div className="h-[200px] rounded-xl bg-dark-gray animate-pulse" />,
});
const MobileInfoTabs = dynamic(() => import('@/widgets/trading/mobile-info-tabs'), {
  loading: () => <div className="h-[300px] rounded-xl bg-dark-gray animate-pulse xl:hidden" />,
});

interface TokenMarketLayoutProps {
  poolAddress: string;
}

export default function TokenMarketLayout({ poolAddress }: TokenMarketLayoutProps) {
  return (
    <div className="text-white overflow-x-hidden w-full max-w-full">
      <HeaderBar poolAddress={poolAddress} />

      <div className="flex flex-col xl:flex-row items-start gap-4 px-3 sm:px-4 pb-36 xl:pb-4 w-full max-w-full">
        {/* LEFT: MC, livestream, chart, stats bar, links/description, comments/trades */}
        <div className="flex-1 min-w-0 space-y-3 w-full overflow-hidden">
          <MarketCapDisplay poolAddress={poolAddress} />
          <PremiumErrorBoundary area="LiveStream" compact>
            <Suspense fallback={<div className="h-[200px] rounded-xl bg-dark-gray animate-pulse" />}>
              <LiveStream poolAddress={poolAddress} />
            </Suspense>
          </PremiumErrorBoundary>
          <PremiumErrorBoundary area="TvChart">
            <Suspense fallback={<div className="h-[400px] rounded-xl bg-dark-gray animate-pulse" />}>
              <TvChart poolAddress={poolAddress} />
            </Suspense>
          </PremiumErrorBoundary>
          <CandlePressure poolAddress={poolAddress} />
          <StatsStrip poolAddress={poolAddress} />
          <TokenDescription poolAddress={poolAddress} />
          <PremiumErrorBoundary area="CommunityReactions" compact>
            <CommunityReactions poolAddress={poolAddress} />
          </PremiumErrorBoundary>
          <PremiumErrorBoundary area="PoolChat">
            <Suspense fallback={<div className="h-[300px] rounded-xl bg-dark-gray animate-pulse" />}>
              <PoolChat poolAddress={poolAddress} />
            </Suspense>
          </PremiumErrorBoundary>
        </div>

        {/* RIGHT: banner, buy panel, creator+rewards, chat/notify, holders preview, holders full */}
        <div className="w-full xl:w-[408px] flex-shrink-0 space-y-2.5">
          <TokenBanner poolAddress={poolAddress} />
          <PremiumErrorBoundary area="TradePanel">
            <div className="hidden xl:block">
              <TradePanel poolAddress={poolAddress} />
            </div>
          </PremiumErrorBoundary>
          <PremiumErrorBoundary area="RiskPanel">
            <Suspense fallback={<div className="h-[120px] rounded-xl bg-dark-gray animate-pulse" />}>
              <RiskPanel poolAddress={poolAddress} />
            </Suspense>
          </PremiumErrorBoundary>
          <CreatorCard poolAddress={poolAddress} />
          <ChatNotifySection poolAddress={poolAddress} />
          <PremiumErrorBoundary area="WhalesPanel">
            <Suspense fallback={<div className="h-[200px] rounded-xl bg-dark-gray animate-pulse" />}>
              <WhalesPanel poolAddress={poolAddress} />
            </Suspense>
          </PremiumErrorBoundary>
          <PremiumErrorBoundary area="MobileInfoTabs">
            <Suspense fallback={<div className="h-[300px] rounded-xl bg-dark-gray animate-pulse xl:hidden" />}>
              <MobileInfoTabs poolAddress={poolAddress} />
            </Suspense>
          </PremiumErrorBoundary>
        </div>
      </div>
      {/* Mobile: fixed Buy button + drawer */}
      <MobileTradeDrawer poolAddress={poolAddress} />
    </div>
  );
}
