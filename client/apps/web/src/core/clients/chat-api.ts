import { sdkBaseUrls } from '@/core/sdk-config';

const API = sdkBaseUrls.chat;

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

interface AuthHeaders {
  wallet: string;
  signature: string;
  message: string;
  nonce?: string;
  expiresAt?: string;
}

function authHeaders(auth: AuthHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.wallet) headers['x-wallet'] = auth.wallet;
  if (auth.signature) headers['x-signature'] = auth.signature;
  if (auth.message) headers['x-message'] = auth.message;
  if (auth.nonce) headers['x-nonce'] = auth.nonce;
  if (auth.expiresAt) headers['x-expires-at'] = auth.expiresAt;
  return headers;
}

export async function getPoolMessages(
  poolAddress: string,
  opts?: { limit?: number; before?: string },
): Promise<{ messages: PoolMessage[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.before) params.set('before', opts.before);
  const qs = params.toString();
  const res = await fetch(`${API}/pool/${poolAddress}/messages${qs ? `?${qs}` : ''}`);
  if (!res.ok) return { messages: [], hasMore: false };
  return res.json();
}

export async function deletePoolMessage(
  poolAddress: string,
  messageId: string,
  auth: AuthHeaders,
): Promise<boolean> {
  const res = await fetch(`${API}/pool/${poolAddress}/messages/${messageId}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', ...authHeaders(auth) },
  });
  return res.ok;
}

export async function getDmConversations(
  auth: AuthHeaders,
): Promise<DmConversation[]> {
  const res = await fetch(`${API}/dm/conversations`, {
    headers: { ...authHeaders(auth) },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.conversations ?? [];
}

export async function getDmMessages(
  conversationId: string,
  auth: AuthHeaders,
  opts?: { limit?: number; before?: string },
): Promise<{ messages: DmMessage[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.before) params.set('before', opts.before);
  const qs = params.toString();
  const res = await fetch(
    `${API}/dm/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ''}`,
    { headers: { ...authHeaders(auth) } },
  );
  if (!res.ok) return { messages: [], hasMore: false };
  return res.json();
}
