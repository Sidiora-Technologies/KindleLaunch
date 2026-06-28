'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getLiveStreams, type StreamPublic } from '@/core/clients/livestream-api';
import { formatAddress } from '@/utils/format';
import { dataApiUrl, metadataApiUrl } from '@/core/sdk-config';

function relTime(ts: number | null): string {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just started';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

interface TokenMeta {
  name?: string;
  symbol?: string;
  logo?: string | null;
}

export default function LiveModule() {
  const [streams, setStreams] = useState<StreamPublic[]>([]);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getLiveStreams();
        if (!cancelled) {
          setStreams(data);
          data.forEach(s => {
            fetch(dataApiUrl(`/stats/${s.poolAddress}`))
              .then(r => r.ok ? r.json() : null)
              .then(d => {
                if (!d?.tokenAddress || cancelled) return;
                return fetch(metadataApiUrl(`/metadata/${d.tokenAddress}`));
              })
              .then(r => r && r.ok ? r.json() : null)
              .then(d => {
                if (d && !cancelled) {
                  setTokenMeta(prev => ({
                    ...prev,
                    [s.poolAddress.toLowerCase()]: {
                      name: d.name,
                      symbol: d.symbol,
                      logo: d.images?.logo || null,
                    },
                  }));
                }
              })
              .catch(() => {});
          });
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    }

    load();
    const interval = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="p-6 text-white">
      <h1 className="text-size-18 font-manrope-extra-bold mb-6">Live Streams</h1>

      {loading ? (
        <div className="text-center py-12 text-dark-disabled text-size-11 animate-pulse">Loading...</div>
      ) : streams.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-size-14 text-dark-disabled mb-2">No live streams right now</div>
          <p className="text-size-11 text-dark-disabled max-w-sm mx-auto">
            Token creators can start a livestream from their token&apos;s page. Check back later.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {streams.map(stream => {
            const meta = tokenMeta[stream.poolAddress.toLowerCase()];
            return (
              <Link
                key={stream.id}
                href={`/token/${stream.poolAddress}`}
                className="border border-dark-gray rounded-xl overflow-hidden hover:border-half-enabled/30 transition group"
              >
                <div className="relative aspect-video bg-dark-gray2 flex items-center justify-center">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-dark-disabled">
                    <polygon points="23 7 16 12 23 17 23 7" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  <div className="absolute top-2 left-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-red-middle text-white text-size-9 font-manrope-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      LIVE
                    </span>
                    {stream.viewerCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-black/60 text-white text-size-9">
                        {stream.viewerCount}
                      </span>
                    )}
                  </div>
                  {stream.startedAt && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-size-9">
                      {relTime(stream.startedAt)}
                    </span>
                  )}
                </div>

                <div className="p-3 space-y-1.5">
                  <div className="text-size-13 font-manrope-bold text-white truncate group-hover:text-green-middle transition">
                    {stream.title}
                  </div>
                  <div className="flex items-center gap-2">
                    {meta?.logo && (
                      <img src={meta.logo} alt="" className="w-5 h-5 rounded-full object-cover" />
                    )}
                    <span className="text-size-11 text-half-enabled">
                      {meta?.name || meta?.symbol || formatAddress(stream.poolAddress, 4)}
                    </span>
                    <span className="text-size-10 text-dark-disabled">
                      by {formatAddress(stream.creatorWallet, 3)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
