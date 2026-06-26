'use client';

import { useState } from 'react';
import CreatorActivity from './creator-activity';
import TopHoldersList from './top-holders-list';
import TopHoldersFullList from './top-holders-full-list';

const TABS = ['Activity', 'Holders', 'Distribution'] as const;
type Tab = (typeof TABS)[number];

interface MobileInfoTabsProps {
  poolAddress: string;
}

export default function MobileInfoTabs({ poolAddress }: MobileInfoTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Activity');

  return (
    <>
      {/* Mobile: tabbed container */}
      <div className="xl:hidden border border-dark-gray rounded-lg overflow-hidden">
        <div className="flex border-b border-dark-gray">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-size-11 font-manrope-bold transition ${
                activeTab === tab
                  ? 'text-white border-b-2 border-green-middle bg-dark-gray2/30'
                  : 'text-dark-disabled hover:text-half-enabled'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div>
          {activeTab === 'Activity' && <CreatorActivity poolAddress={poolAddress} />}
          {activeTab === 'Holders' && <TopHoldersList poolAddress={poolAddress} />}
          {activeTab === 'Distribution' && <TopHoldersFullList poolAddress={poolAddress} />}
        </div>
      </div>

      {/* Desktop: stacked as before */}
      <div className="hidden xl:block space-y-2.5">
        <CreatorActivity poolAddress={poolAddress} />
        <TopHoldersList poolAddress={poolAddress} />
        <TopHoldersFullList poolAddress={poolAddress} />
      </div>
    </>
  );
}
