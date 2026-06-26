'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { getDmMessages, type DmMessage } from '@/core/clients/chat-api';
import { ensureAuth } from '@/core/clients/chat-auth';
import { formatAddress } from '@/utils/format';
import { useDmChat } from '@/hooks/chat/use-chat';

interface DmThreadProps {
  conversationId: string;
  peerAddress: string;
  peerName?: string;
}

function relTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function DmThread({ conversationId, peerAddress, peerName }: DmThreadProps) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { sendDm, incomingDm, connectAndSubscribe, isAuthenticated } = useDmChat();
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load history via REST
  useEffect(() => {
    if (!isConnected || !address || !conversationId) return;
    let cancelled = false;

    async function load() {
      try {
        const auth = await ensureAuth(address!, signMessageAsync);
        if (!auth || cancelled) return;
        const data = await getDmMessages(conversationId, auth, { limit: 50 });
        if (!cancelled) setMessages(data.messages);
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    }

    load();
    return () => { cancelled = true; };
  }, [isConnected, address, conversationId, signMessageAsync]);

  // Connect WS for real-time DMs
  useEffect(() => {
    connectAndSubscribe();
  }, [connectAndSubscribe]);

  // Append incoming DMs to this conversation
  useEffect(() => {
    if (incomingDm && incomingDm.conversationId === conversationId) {
      setMessages(prev => [...prev, incomingDm]);
    }
  }, [incomingDm, conversationId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = useCallback(() => {
    if (!input.trim() || !isAuthenticated) return;
    sendDm(peerAddress, input.trim());

    // Optimistic: add to local list
    const optimistic: DmMessage = {
      id: `local-${Date.now()}`,
      conversationId,
      sender: address!,
      content: input.trim(),
      createdAt: Math.floor(Date.now() / 1000),
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
  }, [input, isAuthenticated, sendDm, peerAddress, conversationId, address]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = peerName || formatAddress(peerAddress, 6);
  const myAddr = address?.toLowerCase();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-gray">
        <a href={`/profile/${peerAddress}`} className="flex items-center gap-2 hover:opacity-80 transition">
          <div className="w-8 h-8 rounded-full bg-dark-gray flex items-center justify-center">
            <span className="text-size-10 font-manrope-bold text-dark-disabled">
              {peerAddress.slice(2, 4).toUpperCase()}
            </span>
          </div>
          <span className="text-size-14 font-manrope-bold text-white">{displayName}</span>
        </a>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-dark-disabled text-size-11 animate-pulse">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-dark-disabled text-size-11">
            No messages yet. Say hello.
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender.toLowerCase() === myAddr;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                  isMe
                    ? 'bg-green-middle/20 text-white rounded-br-sm'
                    : 'bg-dark-gray2 text-half-enabled rounded-bl-sm'
                }`}>
                  <p className="text-size-12 break-words">{msg.content}</p>
                  <span className="text-size-8 text-dark-disabled block mt-0.5 text-right">
                    {relTime(msg.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-dark-gray">
        {isConnected ? (
          <>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isAuthenticated ? `Message ${displayName}...` : 'Connecting...'}
              disabled={!isAuthenticated}
              maxLength={500}
              className="flex-1 bg-dark-gray2 border border-dark-gray rounded-full px-4 py-2 text-size-12 text-white outline-none focus:border-pink-middle transition placeholder:text-dark-disabled disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!isAuthenticated || !input.trim()}
              className="w-9 h-9 rounded-full bg-green-middle text-black flex items-center justify-center hover:bg-green-middle2 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </>
        ) : (
          <div className="flex-1 text-size-11 text-dark-disabled text-center py-2">
            Connect wallet to send messages
          </div>
        )}
      </div>
    </div>
  );
}
