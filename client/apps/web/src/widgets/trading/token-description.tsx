'use client';

import { useState, useEffect } from 'react';
import { sdkBaseUrls } from '@/core/sdk-config';

interface TokenDescriptionProps {
  poolAddress: string;
}

interface Meta {
  description?: string | null;
  socials?: {
    website?: string | null;
    twitter?: string | null;
    telegram?: string | null;
    discord?: string | null;
  };
}

function normalizeUrl(raw: string | null | undefined, fallbackPrefix: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${fallbackPrefix}${raw.replace(/^@/, '')}`;
}

function cleanLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/^x\.com\//, '')
    .replace(/^twitter\.com\//, '')
    .replace(/^t\.me\//, '')
    .replace(/\/$/, '');
}

export default function TokenDescription({ poolAddress }: TokenDescriptionProps) {
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    if (!poolAddress) return;
    fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.tokenAddress) return;
        return fetch(`${sdkBaseUrls.metadata}/metadata/${d.tokenAddress}.json`);
      })
      .then(r => r && r.ok ? r.json() : null)
      .then(d => { if (d) setMeta(d); })
      .catch(() => {});
  }, [poolAddress]);

  const hasSocials = meta?.socials && Object.values(meta.socials).some(v => v);
  const hasContent = meta?.description || hasSocials;

  if (!hasContent) return null;

  return (
    <div className="border border-dark-gray rounded-xl overflow-hidden bg-black-gray2">
      {/* Social chips + action */}
      {hasSocials && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-dark-gray">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
          {meta?.socials?.twitter && (
            <a
              href={normalizeUrl(meta.socials.twitter, 'https://x.com/') || undefined}
              target="_blank"
              rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dark-gray text-size-10 text-half-enabled hover:text-white hover:border-half-enabled transition"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                {cleanLabel(meta.socials.twitter)}
            </a>
          )}
          {meta?.socials?.website && (
            <a
              href={normalizeUrl(meta.socials.website, 'https://') || undefined}
              target="_blank"
              rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dark-gray text-size-10 text-half-enabled hover:text-white hover:border-half-enabled transition"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                {cleanLabel(meta.socials.website)}
            </a>
          )}
          {meta?.socials?.telegram && (
            <a
              href={normalizeUrl(meta.socials.telegram, 'https://t.me/') || undefined}
              target="_blank"
              rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dark-gray text-size-10 text-half-enabled hover:text-white hover:border-half-enabled transition"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                {cleanLabel(meta.socials.telegram) || 'Telegram'}
            </a>
          )}
          {meta?.socials?.discord && (
            <a
              href={normalizeUrl(meta.socials.discord, 'https://discord.gg/') || undefined}
              target="_blank"
              rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dark-gray text-size-10 text-half-enabled hover:text-white hover:border-half-enabled transition"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z"/></svg>
                {cleanLabel(meta.socials.discord) || 'Discord'}
            </a>
          )}
          </div>
          <a
            href={`/terminal`}
            className="text-size-10 text-dark-disabled hover:text-half-enabled transition whitespace-nowrap"
          >
            View on Terminal
          </a>
        </div>
      )}

      {/* Description */}
      {meta?.description && (
        <div className="px-3 py-2">
          <p className="text-size-11 text-half-enabled leading-relaxed line-clamp-2">
            {meta.description}
          </p>
        </div>
      )}
    </div>
  );
}
