'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { usePoolChat, useChatAuth } from '@/hooks/chat/use-chat';
import { sdkBaseUrls } from '@/core/sdk-config';

/**
 * 3.1: Uses backend /stats/:pool for holder count instead of Paxscan.
 */

interface ChatNotifySectionProps {
  poolAddress: string;
}

export default function ChatNotifySection({ poolAddress }: ChatNotifySectionProps) {
  const { isConnected } = useAccount();
  const { authenticate, ready } = useChatAuth();
  const { messages } = usePoolChat(poolAddress);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!poolAddress) return;
    fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.holderCount) setMemberCount(d.holderCount); })
      .catch(() => {});
  }, [poolAddress]);

  const handleJoin = async () => {
    if (!isConnected) return;
    if (!ready) {
      await authenticate();
    }
    setJoined(true);
  };

  return (
    <div className="border border-dark-gray rounded-lg overflow-hidden">
      {/* Token Chat */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-dark-gray">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-half-enabled">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <span className="text-size-12 font-manrope-bold text-white">Token Chat</span>
          <span className="text-size-10 text-dark-disabled">
            {memberCount > 0 ? `${memberCount} members` : ''}
          </span>
        </div>
        {isConnected && !joined ? (
          <button
            onClick={handleJoin}
            className="px-3 py-1 rounded-full bg-green-middle text-black text-size-10 font-manrope-bold hover:bg-green-middle2 transition"
          >
            Join
          </button>
        ) : joined ? (
          <span className="text-size-10 text-green-middle font-manrope-bold">Joined</span>
        ) : null}
      </div>

      {/* Recent messages preview */}
      <div className="px-3 py-2 space-y-1.5 overflow-hidden" style={{ height: 80 }}>
        {messages.length === 0 ? (
          <p className="text-size-11 text-dark-disabled">No messages yet. Be the first to chat.</p>
        ) : (
          messages.slice(-3).map(msg => (
            <div key={msg.id} className="flex items-center gap-1.5 text-size-10 truncate">
              <span className="text-green-middle font-manrope-bold flex-shrink-0">
                {msg.sender.slice(0, 6)}...
              </span>
              <span className="text-half-enabled truncate">{msg.content}</span>
            </div>
          ))
        )}
      </div>

      {/* Get Notified CTA */}
      <div className="px-3 py-2.5 border-t border-dark-gray bg-dark-gray2/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-half-enabled">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            <span className="text-size-11 font-manrope-bold text-half-enabled">Get Notified</span>
          </div>
          <button className="px-3 py-1 rounded-full border border-dark-gray text-size-10 text-half-enabled hover:border-half-enabled transition">
            Enable
          </button>
        </div>
      </div>
    </div>
  );
}
