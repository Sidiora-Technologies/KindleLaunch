'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { dataApiUrl, mediaApiUrl } from '@/core/sdk-config';
import {
  getPoolStreams,
  createStream,
  goLive,
  endStream,
  type StreamPublic,
  type CreateStreamResponse,
} from '@/core/clients/livestream-api';

interface LiveStreamProps {
  poolAddress: string;
}

export default function LiveStream({ poolAddress }: LiveStreamProps) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [activeStream, setActiveStream] = useState<StreamPublic | null>(null);
  const [creatorWallet, setCreatorWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Creator controls state
  const [showCreatorPanel, setShowCreatorPanel] = useState(false);
  const [streamTitle, setStreamTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdStream, setCreatedStream] = useState<CreateStreamResponse | null>(null);
  const [ending, setEnding] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const isCreator = isConnected && address && creatorWallet &&
    address.toLowerCase() === creatorWallet.toLowerCase();

  // Fetch pool creator from metadata
  useEffect(() => {
    if (!poolAddress) return;
    fetch(dataApiUrl(`/stats/${poolAddress}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.tokenAddress) return;
        return fetch(mediaApiUrl(`/metadata/${d.tokenAddress}.json`));
      })
      .then(r => r && r.ok ? r.json() : null)
      .then(d => { if (d?.creator) setCreatorWallet(d.creator); })
      .catch(() => {});
  }, [poolAddress]);

  // Fetch active stream for this pool
  const fetchStream = useCallback(async () => {
    try {
      const streams = await getPoolStreams(poolAddress, true);
      setActiveStream(streams.length > 0 ? streams[0] : null);
    } catch {}
    finally { setLoading(false); }
  }, [poolAddress]);

  useEffect(() => {
    fetchStream();
    const interval = setInterval(fetchStream, 15_000);
    return () => clearInterval(interval);
  }, [fetchStream]);

  // Load HLS when stream is live
  useEffect(() => {
    if (!activeStream?.isLive || !activeStream.playbackUrl || !videoRef.current) return;
    const video = videoRef.current;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeStream.playbackUrl;
      video.play().catch(() => {});
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (!Hls.isSupported()) return;
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(activeStream.playbackUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      }).catch(() => {});
    }
  }, [activeStream?.isLive, activeStream?.playbackUrl]);

  // ── Creator actions ──────────────────────────────────────────
  const handleCreateStream = async () => {
    if (!address || !streamTitle.trim()) return;
    setCreating(true);
    try {
      const msg = `Create stream for ${poolAddress} at ${Date.now()}`;
      const sig = await signMessageAsync({ message: msg });
      const result = await createStream(poolAddress, streamTitle.trim(), {
        wallet: address, signature: sig, message: msg,
      });
      if (result) {
        setCreatedStream(result);
        fetchStream();
      }
    } catch (e: any) {
      console.error('Failed to create stream:', e);
    } finally {
      setCreating(false);
    }
  };

  const handleGoLive = async () => {
    if (!address || !activeStream) return;
    try {
      const msg = `Go live ${activeStream.id} at ${Date.now()}`;
      const sig = await signMessageAsync({ message: msg });
      await goLive(activeStream.id, { wallet: address, signature: sig, message: msg });
      fetchStream();
    } catch {}
  };

  const handleEndStream = async () => {
    if (!address || !activeStream) return;
    setEnding(true);
    try {
      const msg = `End stream ${activeStream.id} at ${Date.now()}`;
      const sig = await signMessageAsync({ message: msg });
      await endStream(activeStream.id, { wallet: address, signature: sig, message: msg });
      setActiveStream(null);
      setCreatedStream(null);
      setShowCreatorPanel(false);
    } catch {}
    finally { setEnding(false); }
  };

  // ── Render: nothing if no stream and not creator ──────────
  if (loading) return null;
  if (!activeStream && !isCreator) return null;

  return (
    <div className="border border-dark-gray rounded-lg overflow-hidden">
      {/* Live stream player */}
      {activeStream?.isLive && (
        <div className="relative bg-black aspect-video">
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            playsInline
            muted
          />
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-red-middle text-white text-size-10 font-manrope-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
            {activeStream.viewerCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-black/60 text-white text-size-10">
                {activeStream.viewerCount} watching
              </span>
            )}
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <span className="text-size-12 font-manrope-bold text-white drop-shadow-lg">
              {activeStream.title}
            </span>
          </div>
        </div>
      )}

      {/* Stream info bar (when live but not playing, or starting soon) */}
      {activeStream && !activeStream.isLive && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-black-gray">
          <span className="px-2 py-0.5 rounded bg-yellow-middle/20 text-yellow-middle text-size-10 font-manrope-bold">
            STARTING SOON
          </span>
          <span className="text-size-12 text-half-enabled font-manrope-bold flex-1 truncate">
            {activeStream.title}
          </span>
        </div>
      )}

      {/* Creator controls — only visible to pool creator */}
      {isCreator && (
        <div className="border-t border-dark-gray">
          {!showCreatorPanel && !activeStream && (
            <button
              onClick={() => setShowCreatorPanel(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-size-12 font-manrope-bold text-green-middle hover:bg-dark-gray2/30 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              Start livestream
            </button>
          )}

          {/* Create stream form */}
          {showCreatorPanel && !activeStream && !createdStream && (
            <div className="p-4 space-y-3">
              <div className="text-size-13 font-manrope-bold text-white">Start a livestream</div>
              <input
                type="text"
                value={streamTitle}
                onChange={e => setStreamTitle(e.target.value)}
                placeholder="Stream title..."
                maxLength={100}
                className="w-full bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-2 text-size-12 text-white outline-none focus:border-green-middle transition placeholder:text-dark-disabled"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateStream}
                  disabled={creating || !streamTitle.trim()}
                  className="flex-1 py-2 rounded-lg bg-green-middle text-black text-size-12 font-manrope-bold hover:bg-green-middle2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create Stream'}
                </button>
                <button
                  onClick={() => setShowCreatorPanel(false)}
                  className="px-4 py-2 rounded-lg border border-dark-gray text-size-12 text-dark-disabled hover:text-half-enabled transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Stream created — show RTMP credentials */}
          {createdStream && !activeStream?.isLive && (
            <div className="p-4 space-y-3">
              <div className="text-size-13 font-manrope-bold text-green-middle">Stream created</div>
              <div className="space-y-2 bg-dark-gray2/40 rounded-lg p-3">
                <div>
                  <span className="text-size-9 text-dark-disabled block">RTMP URL (paste into OBS)</span>
                  <div className="flex items-center gap-2">
                    <code className="text-size-10 text-half-enabled break-all flex-1 font-mono">{createdStream.rtmpUrl}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(createdStream.rtmpUrl)}
                      className="text-size-9 text-dark-disabled hover:text-half-enabled transition flex-shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-size-9 text-dark-disabled block">Stream Key</span>
                  <div className="flex items-center gap-2">
                    <code className="text-size-10 text-half-enabled break-all flex-1 font-mono">{createdStream.streamKey}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(createdStream.streamKey)}
                      className="text-size-9 text-dark-disabled hover:text-half-enabled transition flex-shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-size-10 text-dark-disabled">
                Paste the RTMP URL and stream key into OBS or your streaming software. The stream will go live automatically when you start broadcasting.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleGoLive}
                  className="flex-1 py-2 rounded-lg border border-green-middle/40 text-green-middle text-size-11 font-manrope-bold hover:bg-green-middle/10 transition"
                >
                  Mark as Live Now
                </button>
                <button
                  onClick={handleEndStream}
                  disabled={ending}
                  className="px-4 py-2 rounded-lg border border-red-middle/40 text-red-middle text-size-11 font-manrope-bold hover:bg-red-middle/10 transition disabled:opacity-40"
                >
                  {ending ? 'Ending...' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* End stream button when live */}
          {activeStream?.isLive && (
            <div className="flex items-center justify-between px-4 py-2 bg-dark-gray2/20">
              <span className="text-size-11 text-dark-disabled">You are live</span>
              <button
                onClick={handleEndStream}
                disabled={ending}
                className="px-3 py-1.5 rounded-lg bg-red-middle/20 text-red-middle text-size-11 font-manrope-bold hover:bg-red-middle/30 transition disabled:opacity-40"
              >
                {ending ? 'Ending...' : 'End Stream'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
