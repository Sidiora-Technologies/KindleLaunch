'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import type { PoolMessage, DmMessage } from '@/core/clients/chat-api';
import { getPoolMessages } from '@/core/clients/chat-api';
import { ensureAuth, getCachedAuth, clearAuth } from '@/core/clients/chat-auth';
import { reportError } from '@/core/report-error';
import * as chatWs from '@/core/clients/chat-ws';

export function useChatAuth() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      clearAuth();
      setReady(false);
      return;
    }
    // If already cached for this wallet, no signature needed
    const existing = getCachedAuth();
    if (existing && existing.wallet.toLowerCase() === address.toLowerCase()) {
      setReady(true);
      return;
    }
    setReady(false);
  }, [isConnected, address]);

  const authenticate = useCallback(async () => {
    if (!address) return null;
    const auth = await ensureAuth(address, signMessageAsync);
    if (auth) setReady(true);
    return auth;
  }, [address, signMessageAsync]);

  return { auth: getCachedAuth(), ready, authenticate };
}

interface PendingMessage extends PoolMessage {
  pending?: boolean;
  failed?: boolean;
  localId?: string;
}

let localIdCounter = 0;
function nextLocalId(): string {
  return `__local_${++localIdCounter}_${Date.now()}`;
}

export function usePoolChat(poolAddress: string) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<string>('disconnected');
  const [replyTo, setReplyTo] = useState<PoolMessage | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const pendingIds = useRef(new Set<string>());

  // Load message history via REST (no auth needed — public endpoint)
  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;
    setLoading(true);
    getPoolMessages(poolAddress, { limit: 50 })
      .then(data => { if (!cancelled) setMessages(data.messages); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [poolAddress]);

  // If we already have a cached auth (from a previous signature in this
  // session), connect the WebSocket eagerly — no new signature prompt.
  useEffect(() => {
    if (!isConnected || !address || !poolAddress) return;
    const existing = getCachedAuth();
    if (!existing || existing.wallet.toLowerCase() !== address.toLowerCase()) return;
    let cancelled = false;

    const onPoolMsg = (m: PoolMessage) => {
      if (m.poolAddress.toLowerCase() !== poolAddress.toLowerCase()) return;
      setMessages(prev => {
        // Dedup: replace pending local msg that matches server content
        const deduped = prev.filter(p => {
          if (!p.pending || !p.localId) return true;
          if (p.content === m.content && p.sender.toLowerCase() === m.sender.toLowerCase()) {
            pendingIds.current.delete(p.localId);
            return false;
          }
          return true;
        });
        // Avoid duplicates by server id
        if (deduped.some(p => p.id === m.id)) return deduped;
        return [...deduped, m];
      });
    };

    chatWs.connect(existing, {
      onPoolMessage: onPoolMsg,
      onStatusChange: setWsStatus,
      onError: (e) => reportError(e, { area: 'chat-ws', action: 'poolChatError' }),
    });
    chatWs.joinPool(poolAddress);
    if (!cancelled) setIsAuthed(true);

    return () => { cancelled = true; chatWs.leavePool(poolAddress); };
  }, [isConnected, address, poolAddress]);

  const onPoolMsg = useCallback((m: PoolMessage) => {
    if (m.poolAddress.toLowerCase() !== poolAddress.toLowerCase()) return;
    setMessages(prev => {
      const deduped = prev.filter(p => {
        if (!p.pending || !p.localId) return true;
        if (p.content === m.content && p.sender.toLowerCase() === m.sender.toLowerCase()) {
          pendingIds.current.delete(p.localId);
          return false;
        }
        return true;
      });
      if (deduped.some(p => p.id === m.id)) return deduped;
      return [...deduped, m];
    });
  }, [poolAddress]);

  // Lazy auth: only triggered when the user sends their first message.
  const connectChat = useCallback(async () => {
    if (!isConnected || !address) return false;
    const auth = await ensureAuth(address, signMessageAsync);
    if (!auth) return false;
    chatWs.connect(auth, {
      onPoolMessage: onPoolMsg,
      onStatusChange: setWsStatus,
      onError: (e) => reportError(e, { area: 'chat-ws', action: 'poolChatError' }),
    });
    chatWs.joinPool(poolAddress);
    setIsAuthed(true);
    return true;
  }, [isConnected, address, poolAddress, signMessageAsync, onPoolMsg]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    // If not yet authed, prompt signature now (first message only)
    if (!isAuthed) {
      const ok = await connectChat();
      if (!ok) {
        reportError('Chat auth failed', { area: 'pool-chat', action: 'sendMessage' });
        return;
      }
    }
    // Optimistic insert
    const localId = nextLocalId();
    const optimistic: PendingMessage = {
      id: localId,
      localId,
      poolAddress,
      sender: address || '0x',
      content: content.trim(),
      replyToId: replyTo?.id ?? null,
      createdAt: Math.floor(Date.now() / 1000),
      pending: true,
    };
    pendingIds.current.add(localId);
    setMessages(prev => [...prev, optimistic]);
    setReplyTo(null);

    try {
      chatWs.sendPoolMessage(poolAddress, content.trim(), replyTo?.id);
    } catch (error) {
      reportError(error, { area: 'pool-chat', action: 'sendMessage' });
      // Mark as failed
      setMessages(prev =>
        prev.map(m => m.localId === localId ? { ...m, pending: false, failed: true } : m)
      );
    }
  }, [poolAddress, replyTo, isAuthed, connectChat, address]);

  const loadMore = useCallback(async () => {
    if (messages.length === 0) return;
    const oldest = messages[0];
    const data = await getPoolMessages(poolAddress, { limit: 50, before: oldest.id });
    if (data.messages.length > 0) {
      setMessages(prev => [...data.messages, ...prev]);
    }
    return data.hasMore;
  }, [poolAddress, messages]);

  return {
    messages,
    loading,
    wsStatus,
    sendMessage,
    connectChat,
    loadMore,
    replyTo,
    setReplyTo,
    isAuthenticated: isAuthed && wsStatus === 'connected',
    isConnected,
    retryMessage: useCallback((localId: string) => {
      const msg = messages.find(m => m.localId === localId && m.failed);
      if (!msg) return;
      setMessages(prev =>
        prev.map(m => m.localId === localId ? { ...m, pending: true, failed: false } : m)
      );
      try {
        chatWs.sendPoolMessage(poolAddress, msg.content, msg.replyToId);
      } catch (error) {
        reportError(error, { area: 'pool-chat', action: 'retryMessage' });
        setMessages(prev =>
          prev.map(m => m.localId === localId ? { ...m, pending: false, failed: true } : m)
        );
      }
    }, [poolAddress, messages]),
  };
}

export function useDmChat() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [wsStatus, setWsStatus] = useState<string>('disconnected');
  const [incomingDm, setIncomingDm] = useState<DmMessage | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);

  const connectAndSubscribe = useCallback(async () => {
    if (!isConnected || !address) return;
    const auth = await ensureAuth(address, signMessageAsync);
    if (!auth) return;
    chatWs.connect(auth, {
      onDm: setIncomingDm,
      onStatusChange: setWsStatus,
      onError: (e) => console.error('DM WS error:', e),
    });
    chatWs.subscribeDms();
    setIsAuthed(true);
  }, [isConnected, address, signMessageAsync]);

  const sendDm = useCallback((to: string, content: string) => {
    if (!content.trim() || !isAuthed) return;
    chatWs.sendDm(to, content.trim());
  }, [isAuthed]);

  return {
    wsStatus,
    incomingDm,
    connectAndSubscribe,
    sendDm,
    isAuthenticated: isAuthed && wsStatus === 'connected',
  };
}
