import { socialReadUrl, socialWriteUrl } from '@/core/sdk-config';

// Reads are public and go DIRECT to media/social (socialapi.kindlelaunch.com).
// Identity-scoped reads (DMs) and all writes go through the gateway
// (cdn.kindlelaunch.com/social), which authenticates the session and injects
// the trusted X-Actor-Wallet header media/social requires. Writes/DM reads send
// `credentials: 'include'` so the gateway session cookie travels.

export interface PoolMessage {
  id: string;
  poolAddress: string;
  sender: string;
  content: string;
  replyToId: string | null;
  createdAt: number;
}

export interface DmConversation {
  id: string;
  peer: string;
  lastMessageAt: number | null;
}

export interface DmMessage {
  id: string;
  conversationId: string;
  sender: string;
  content: string;
  createdAt: number;
}

export async function getPoolMessages(
  poolAddress: string,
  opts?: { limit?: number; before?: string },
): Promise<{ messages: PoolMessage[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.before) params.set('before', opts.before);
  const qs = params.toString();
  const res = await fetch(socialReadUrl(`/pool/${poolAddress}/messages${qs ? `?${qs}` : ''}`));
  if (!res.ok) return { messages: [], hasMore: false };
  return res.json();
}

export async function deletePoolMessage(
  poolAddress: string,
  messageId: string,
): Promise<boolean> {
  const res = await fetch(socialWriteUrl(`/pool/${poolAddress}/messages/${messageId}`), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
  });
  return res.ok;
}

export async function getDmConversations(): Promise<DmConversation[]> {
  // Identity-scoped: routed through the gateway so the session resolves the actor.
  const res = await fetch(socialWriteUrl('/dm/conversations'), { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.conversations ?? [];
}

export async function getDmMessages(
  conversationId: string,
  opts?: { limit?: number; before?: string },
): Promise<{ messages: DmMessage[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.before) params.set('before', opts.before);
  const qs = params.toString();
  const res = await fetch(
    socialWriteUrl(`/dm/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ''}`),
    { credentials: 'include' },
  );
  if (!res.ok) return { messages: [], hasMore: false };
  return res.json();
}
