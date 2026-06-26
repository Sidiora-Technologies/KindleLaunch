'use client';

import { useState, useEffect } from 'react';
import { sdkBaseUrls } from '@/core/sdk-config';

interface TokenBannerProps {
  poolAddress: string;
}

export default function TokenBanner({ poolAddress }: TokenBannerProps) {
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!poolAddress) return;
    fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.tokenAddress) return;
        return fetch(`${sdkBaseUrls.metadata}/metadata/${d.tokenAddress}.json`);
      })
      .then(r => r && r.ok ? r.json() : null)
      .then(d => {
        if (d?.images?.banner) setBannerUrl(d.images.banner);
      })
      .catch(() => {});
  }, [poolAddress]);

  if (!bannerUrl) return null;

  return (
    <div className="rounded-xl overflow-hidden h-[120px] bg-dark-gray">
      <img
        src={bannerUrl}
        alt=""
        className="w-full h-full object-cover"
      />
    </div>
  );
}
