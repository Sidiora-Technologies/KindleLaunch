'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import Link from 'next/link';
import { getDmConversations, type DmConversation } from '@/core/clients/chat-api';
import { ensureAuth } from '@/core/clients/chat-auth';
import { formatAddress } from '@/utils/format';
import { sdkBaseUrls, getUserAvatarUrl } from '@/core/sdk-config';

function relTime(ts: number | null): string {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface PeerMeta {
  display_name?: string;
  avatarUrl?: string | null;
}

export default function ConversationList() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [peerMeta, setPeerMeta] = useState<Record<string, PeerMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;

    async function load() {
      try {
        const auth = await ensureAuth(address!, signMessageAsync);
        if (!auth || cancelled) return;
        const convos = await getDmConversations(auth);
        if (!cancelled) {
          setConversations(convos);
          // Fetch peer display names
          const peers = convos.map(c => c.peer).filter(Boolean);
          peers.forEach(peer => {
            fetch(`${sdkBaseUrls.users}/users/${peer}`)
              .then(r => r.ok ? r.json() : null)
              .then(u => {
                if (u && !cancelled) {
                  setPeerMeta(prev => ({ ...prev, [peer.toLowerCase()]: u }));
                }
              })
              .catch(() => {});
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load conversations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isConnected, address, signMessageAsync]);

  if (!isConnected) {
    return (
      <div className="text-center py-12 text-dark-disabled text-size-13">
        Connect your wallet to view messages
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-dark-disabled text-size-11 animate-pulse">
        Loading conversations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-middle text-size-11">
        {error}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center py-12 text-dark-disabled text-size-13">
        No conversations yet. Start a conversation from a user's profile.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map(convo => {
        const meta = peerMeta[convo.peer.toLowerCase()];
        return (
          <Link
            key={convo.id}
            href={`/chat/${encodeURIComponent(convo.id)}`}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-dark-gray2/40 transition"
          >
            <div className="w-10 h-10 rounded-full bg-dark-gray flex-shrink-0 flex items-center justify-center overflow-hidden">
              {meta?.avatarUrl ? (
                <img src={getUserAvatarUrl(convo.peer)} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-size-12 font-manrope-bold text-dark-disabled">
                  {convo.peer.slice(2, 4).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-size-13 font-manrope-bold text-white truncate">
                {meta?.display_name || formatAddress(convo.peer, 6)}
              </div>
              <div className="text-size-10 text-dark-disabled">
                {relTime(convo.lastMessageAt)}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dark-disabled flex-shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </Link>
        );
      })}
    </div>
  );
}
