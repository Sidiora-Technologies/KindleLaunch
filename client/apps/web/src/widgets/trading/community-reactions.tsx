'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataApiUrl } from '@/core/sdk-config';
import { usePoolEvents } from '@/core/realtime/use-data-stream';
import { DataChannels, type DataEvent } from '@/core/realtime/data-stream';

/**
 * 3.6: Community reactions wired to backend /stats/:pool/reactions.
 * Falls back to localStorage for display when backend is unavailable.
 */

const REACTIONS = [
  { emoji: '🚀', label: 'Bullish', key: 'bullish' },
  { emoji: '🔥', label: 'Hot', key: 'hot' },
  { emoji: '💎', label: 'Diamond', key: 'diamond' },
  { emoji: '🐻', label: 'Bearish', key: 'bearish' },
  { emoji: '💩', label: 'Trash', key: 'trash' },
  { emoji: '🚩', label: 'Warning', key: 'warning' },
] as const;

type ReactionKey = typeof REACTIONS[number]['emoji'];
type ReactionApiKey = typeof REACTIONS[number]['key'];

const emojiToApiKey: Record<ReactionKey, ReactionApiKey> = {
  '🚀': 'bullish', '🔥': 'hot', '💎': 'diamond',
  '🐻': 'bearish', '💩': 'trash', '🚩': 'warning',
};

const apiKeyToEmoji: Record<ReactionApiKey, ReactionKey> = {
  bullish: '🚀', hot: '🔥', diamond: '💎',
  bearish: '🐻', trash: '💩', warning: '🚩',
};

function getVoteKey(poolAddress: string) {
  return `sidiora-voted-${poolAddress}`;
}

const defaultCounts = (): Record<ReactionKey, number> => ({ '🚀': 0, '🔥': 0, '💎': 0, '🐻': 0, '💩': 0, '🚩': 0 });

interface CommunityReactionsProps {
  poolAddress: string;
  walletAddress?: string;
  signMessage?: (msg: string) => Promise<string>;
}

export default function CommunityReactions({ poolAddress, walletAddress, signMessage }: CommunityReactionsProps) {
  const [counts, setCounts] = useState<Record<ReactionKey, number>>(defaultCounts);
  const [voted, setVoted] = useState<ReactionKey | null>(null);
  const [burst, setBurst] = useState<ReactionKey | null>(null);

  // Fetch reactions from backend
  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;
    (async () => {
      try {
        // Bootstrap from the one-shot BFF snapshot (reactions live under `reactions`).
        const res = await fetch(dataApiUrl(`/bff/token/${poolAddress}`));
        if (res.ok && !cancelled) {
          const bff = await res.json();
          const map = bff?.reactions?.reactions ?? bff?.reactions ?? {};
          const next = defaultCounts();
          for (const [apiKey, count] of Object.entries(map)) {
            const emoji = apiKeyToEmoji[apiKey as ReactionApiKey];
            if (emoji) next[emoji] = count as number;
          }
          setCounts(next);
        }
      } catch { /* use defaults */ }
      // Restore local vote state
      try {
        const v = localStorage.getItem(getVoteKey(poolAddress));
        if (!cancelled && v) setVoted(v as ReactionKey);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [poolAddress]);

  // Live tallies off the stream (must-deliver reactions_update).
  usePoolEvents(
    poolAddress,
    [DataChannels.ReactionsUpdate],
    (event: DataEvent) => {
      const raw = event.data as { reactions?: Record<string, number> } | undefined;
      const map = raw?.reactions ?? {};
      const next = defaultCounts();
      for (const [apiKey, count] of Object.entries(map)) {
        const emoji = apiKeyToEmoji[apiKey as ReactionApiKey];
        if (emoji) next[emoji] = count as number;
      }
      setCounts(next);
    },
  );

  const handleVote = useCallback(async (emoji: ReactionKey) => {
    const apiKey = emojiToApiKey[emoji];

    // Optimistic UI update
    setCounts((prev) => {
      const next = { ...prev };
      if (voted === emoji) {
        next[emoji] = Math.max(0, next[emoji] - 1);
      } else {
        if (voted) next[voted] = Math.max(0, next[voted] - 1);
        next[emoji] = (next[emoji] || 0) + 1;
      }
      return next;
    });

    const newVoted = voted === emoji ? null : emoji;
    setVoted(newVoted);
    try {
      if (newVoted) {
        localStorage.setItem(getVoteKey(poolAddress), newVoted);
      } else {
        localStorage.removeItem(getVoteKey(poolAddress));
      }
    } catch { /* noop */ }

    setBurst(emoji);
    setTimeout(() => setBurst(null), 600);

    // Persist the vote when a public reactions-write edge is configured. There
    // is no public reactions-write route today (the worker route is internal),
    // so this is opt-in via NEXT_PUBLIC_REACTIONS_WRITE_URL and a no-op
    // otherwise; the tally still updates live via the reactions_update stream.
    const writeBase = (process.env.NEXT_PUBLIC_REACTIONS_WRITE_URL || '').replace(/\/$/, '');
    if (writeBase && walletAddress && signMessage) {
      try {
        const message = `react:${poolAddress}:${apiKey}:${Date.now()}`;
        const signature = await signMessage(message);
        await fetch(`${writeBase}/stats/${poolAddress}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reaction: apiKey, walletAddress, signature, message }),
        });
      } catch { /* best-effort */ }
    }
  }, [voted, poolAddress, walletAddress, signMessage]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-size-10 text-dark-disabled font-manrope-bold uppercase tracking-wider">Community Sentiment</span>
        {total > 0 && (
          <span className="text-size-9 text-dark-disabled">({total} votes)</span>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {REACTIONS.map(({ emoji, label }) => {
          const isActive = voted === emoji;
          const count = counts[emoji] || 0;
          return (
            <motion.button
              key={emoji}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleVote(emoji)}
              title={label}
              className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-size-11 transition-all ${
                isActive
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-white'
                  : 'border-dark-gray/60 bg-dark-gray2/30 text-dark-disabled hover:text-half-enabled hover:border-dark-gray'
              }`}
            >
              <span className="text-sm">{emoji}</span>
              {count > 0 && (
                <span className={`text-size-10 font-manrope-bold ${isActive ? 'text-emerald-400' : ''}`}>
                  {count}
                </span>
              )}
              <AnimatePresence>
                {burst === emoji && (
                  <motion.span
                    initial={{ scale: 1, opacity: 1, y: 0 }}
                    animate={{ scale: 2, opacity: 0, y: -20 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute -top-1 left-1/2 -translate-x-1/2 text-lg pointer-events-none"
                  >
                    {emoji}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
