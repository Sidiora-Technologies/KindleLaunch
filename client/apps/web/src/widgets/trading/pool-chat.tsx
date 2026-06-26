'use client';

import { useState, useRef, useEffect } from 'react';
import { usePoolChat } from '@/hooks/chat/use-chat';
import { usePoolTrades } from '@/hooks/market/use-pool-trades';
import { formatAddress, formatPrice, formatTokenAmount, formatVolume } from '@/utils/format';
import type { PoolMessage } from '@/core/clients/chat-api';

interface PoolChatProps {
  poolAddress: string;
}

function relTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function ChatMessage({
  msg,
  onReply,
  replyTarget,
}: {
  msg: PoolMessage;
  onReply: (msg: PoolMessage) => void;
  replyTarget?: PoolMessage;
}) {
  return (
    <div className="flex gap-2.5 py-2 px-3 hover:bg-dark-gray2/20 transition group">
      <div className="w-6 h-6 rounded-full bg-dark-gray flex-shrink-0 flex items-center justify-center mt-0.5">
        <span className="text-size-8 text-dark-disabled font-manrope-bold">
          {msg.sender.slice(2, 4).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={`/profile/${msg.sender}`}
            className="text-size-11 font-manrope-bold text-green-middle hover:underline"
          >
            {formatAddress(msg.sender, 4)}
          </a>
          <span className="text-size-9 text-dark-disabled">{relTime(msg.createdAt)}</span>
          <button
            onClick={() => onReply(msg)}
            className="text-size-9 text-dark-disabled hover:text-half-enabled transition opacity-0 group-hover:opacity-100 ml-auto"
          >
            Reply
          </button>
        </div>
        {msg.replyToId && replyTarget && (
          <div className="text-size-9 text-dark-disabled mt-0.5 pl-2 border-l border-dark-gray truncate">
            Replying to {formatAddress(replyTarget.sender, 3)}: {replyTarget.content.slice(0, 60)}
          </div>
        )}
        <p className={`text-size-12 mt-0.5 break-words ${(msg as any).pending ? 'text-dark-disabled italic' : (msg as any).failed ? 'text-red-middle' : 'text-half-enabled'}`}>{msg.content}</p>
        {(msg as any).failed && (
          <button className="text-size-9 text-red-middle hover:underline mt-0.5">Retry</button>
        )}
        {(msg as any).pending && !((msg as any).failed) && (
          <span className="text-size-9 text-dark-disabled">Sending...</span>
        )}
      </div>
    </div>
  );
}

export default function PoolChat({ poolAddress }: PoolChatProps) {
  const {
    messages,
    loading,
    sendMessage,
    loadMore,
    replyTo,
    setReplyTo,
    isAuthenticated,
    isConnected,
  } = usePoolChat(poolAddress);

  const [input, setInput] = useState('');
  const [tab, setTab] = useState<'thread' | 'trades'>('thread');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, autoScroll]);

  // Detect if user scrolled up
  const handleScroll = () => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const msg = input;
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build reply lookup
  const msgMap = new Map(messages.map(m => [m.id, m]));

  return (
    <div className="border border-dark-gray rounded-lg overflow-hidden">
      {/* Tabs: Thread / Trades */}
      <div className="flex items-center border-b border-dark-gray">
        {(['thread', 'trades'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-size-12 font-manrope-bold transition ${
              tab === t
                ? 'text-white border-b-2 border-green-middle'
                : 'text-dark-disabled hover:text-half-enabled'
            }`}
          >
            {t === 'thread' ? 'Comments' : 'Trades'}
          </button>
        ))}
      </div>

      {tab === 'thread' ? (
        <>
          {/* Messages */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="overflow-y-auto" style={{ maxHeight: 420 }}
          >
            {loading ? (
              <div className="p-6 text-center text-dark-disabled text-size-11 animate-pulse">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="p-6 text-center text-dark-disabled text-size-11">
                No messages yet. Be the first to comment.
              </div>
            ) : (
              <>
                <button
                  onClick={() => loadMore()}
                  className="w-full py-2 text-size-10 text-dark-disabled hover:text-half-enabled transition"
                >
                  Older activity
                </button>
                {messages.map(msg => (
                  <ChatMessage
                    key={msg.id}
                    msg={msg}
                    onReply={setReplyTo}
                    replyTarget={msg.replyToId ? msgMap.get(msg.replyToId) : undefined}
                  />
                ))}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Reply indicator */}
          {replyTo && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-gray2/40 border-t border-dark-gray">
              <span className="text-size-10 text-dark-disabled truncate flex-1">
                Replying to {formatAddress(replyTo.sender, 3)}: {replyTo.content.slice(0, 50)}
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-size-10 text-dark-disabled hover:text-red-middle transition"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Compose */}
          <div className="flex items-center gap-2 p-3 border-t border-dark-gray">
            {isConnected ? (
              <>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isAuthenticated ? 'Add a comment...' : 'Type a message to start chatting...'}
                  disabled={false}
                  maxLength={500}
                  className="flex-1 bg-dark-gray2 border border-dark-gray rounded-lg px-3 py-2 text-size-12 text-white outline-none focus:border-pink-middle transition placeholder:text-dark-disabled disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="px-3 py-2 rounded-lg bg-green-middle text-black text-size-11 font-manrope-bold hover:bg-green-middle2 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </>
            ) : (
              <div className="flex-1 text-size-11 text-dark-disabled text-center py-2">
                Connect wallet to chat
              </div>
            )}
          </div>
        </>
      ) : (
        <TradesTab poolAddress={poolAddress} />
      )}
    </div>
  );
}

// ── Trades tab (inline, replaces standalone TxFeed) ────────
function TradesTab({ poolAddress }: { poolAddress: string }) {
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all');

  // Push-first: live trades off the swap stream (core/api has no recent-trades
  // REST snapshot), replacing the dead /stats/{pool}/transactions 5s poll.
  const { data: txs, isLoading: loading } = usePoolTrades(poolAddress, filter);

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-gray">
        <div className="flex gap-1 ml-auto">
          {([['all', 'All'], ['buy', 'Buys'], ['sell', 'Sells']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={`px-2.5 py-1 rounded text-size-10 font-manrope-bold transition ${
                filter === key ? 'bg-pink-opacity-1 text-pink-middle' : 'text-dark-disabled hover:text-half-enabled'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-size-9 text-dark-disabled">Newest</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
        {loading ? (
          <div className="p-4 text-center text-dark-disabled text-size-11 animate-pulse">Loading...</div>
        ) : txs.length === 0 ? (
          <div className="p-4 text-center text-dark-disabled text-size-11">No trades yet</div>
        ) : (
          txs.map(tx => (
            <div key={tx.id} className="flex items-center gap-2 px-3 py-2 border-b border-dark-gray/30 hover:bg-dark-gray2/20 transition text-size-11">
              <span className={`font-manrope-bold w-8 ${tx.isBuy ? 'text-green-middle' : 'text-red-middle'}`}>
                {tx.isBuy ? 'Buy' : 'Sell'}
              </span>
              <a
                href={`/profile/${tx.sender}`}
                className="text-half-enabled hover:text-pink-middle transition"
              >
                {formatAddress(tx.sender, 4)}
              </a>
              <span className="text-white ml-auto">
                {tx.isBuy ? formatVolume(tx.amountIn) : formatTokenAmount(tx.amountIn)}
              </span>
              <span className="text-dark-disabled">&rarr;</span>
              <span className="text-white">
                {tx.isBuy ? formatTokenAmount(tx.amountOut) : formatVolume(tx.amountOut)}
              </span>
              <span className="text-half-enabled">{formatPrice(tx.price)}</span>
              <span className="text-dark-disabled text-size-9">{relTime(tx.blockTimestamp)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
