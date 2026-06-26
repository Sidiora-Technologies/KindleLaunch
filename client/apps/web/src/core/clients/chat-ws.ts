import { getServiceWsUrl } from '@/core/sdk-config';
import { reportError } from '@/core/report-error';
import { WsManager, type WsManagerContext } from '@/core/realtime/ws-manager';
import type { PoolMessage, DmMessage } from './chat-api';

type WsStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected';

interface ChatWsCallbacks {
  onPoolMessage?: (msg: PoolMessage) => void;
  onDm?: (msg: DmMessage) => void;
  onStatusChange?: (status: WsStatus) => void;
  onError?: (error: string) => void;
}

interface ChatAuth {
  wallet: string;
  signature: string;
  message: string;
  nonce?: string;
  expiresAt?: string;
}

interface ChatInbound {
  type: string;
  id?: string;
  poolAddress?: string;
  conversationId?: string;
  sender?: string;
  content?: string;
  replyToId?: string | null;
  createdAt?: number;
  message?: string;
}

// ── Per-consumer subscription map ─────────────────────────────
type ConsumerId = string;
const consumers = new Map<ConsumerId, ChatWsCallbacks>();
let nextConsumerId = 0;

// Single shared connection, now backed by the resilient WsManager backbone
// (pong-timeout dead-conn detection + backoff/circuit-breaker live there).
let manager: WsManager<ChatInbound> | null = null;
let status: WsStatus = 'disconnected';
let authPayload: ChatAuth | null = null;
const joinedPools: Set<string> = new Set();
let dmSubscribed = false;

function setStatus(s: WsStatus) {
  status = s;
  consumers.forEach((cbs) => cbs.onStatusChange?.(s));
}

function notifyPoolMessage(msg: PoolMessage) {
  consumers.forEach((cbs) => cbs.onPoolMessage?.(msg));
}

function notifyDm(msg: DmMessage) {
  consumers.forEach((cbs) => cbs.onDm?.(msg));
}

function notifyError(error: string) {
  consumers.forEach((cbs) => cbs.onError?.(error));
}

function handleMessage(data: ChatInbound, ctx: WsManagerContext) {
  switch (data.type) {
    case 'auth_ok':
      setStatus('connected');
      // Resubscribe everything on (re)auth — restores state after reconnect.
      joinedPools.forEach((p) => ctx.send({ type: 'join_pool', poolAddress: p }));
      if (dmSubscribed) ctx.send({ type: 'subscribe_dms' });
      break;
    case 'pool_message':
      notifyPoolMessage({
        id: data.id as string,
        poolAddress: data.poolAddress as string,
        sender: data.sender as string,
        content: data.content as string,
        replyToId: data.replyToId ?? null,
        createdAt: data.createdAt as number,
      });
      break;
    case 'dm':
      notifyDm({
        id: data.id as string,
        conversationId: data.conversationId as string,
        sender: data.sender as string,
        content: data.content as string,
        createdAt: data.createdAt as number,
      });
      break;
    case 'error':
      notifyError(data.message ?? 'unknown error');
      break;
  }
}

function ensureManager(): WsManager<ChatInbound> {
  if (manager) return manager;
  manager = new WsManager<ChatInbound>({
    url: () => getServiceWsUrl('chat'),
    onMessage: (data, ctx) => {
      try {
        handleMessage(data, ctx);
      } catch (error) {
        reportError(error, { area: 'chat-ws', action: 'handleMessage' });
      }
    },
    // Snapshot+delta resync: on every (re)connect, (re)authenticate. The
    // join_pool/subscribe_dms resubscribe happens on the subsequent auth_ok.
    onResync: (ctx) => {
      const auth = authPayload;
      if (!auth) return;
      setStatus('authenticating');
      ctx.send({
        type: 'auth',
        wallet: auth.wallet,
        signature: auth.signature,
        message: auth.message,
        nonce: auth.nonce,
        expiresAt: auth.expiresAt,
      });
    },
    onStatusChange: (s) => {
      // 'open' -> 'authenticating' is driven by onResync; 'connected' by auth_ok.
      if (s === 'connecting') setStatus('connecting');
      else if (s === 'closed' || s === 'circuit-open') setStatus('disconnected');
    },
    onError: (msg) => notifyError(msg),
    // Auth-failure close codes must NOT be retried (would loop on a bad sig).
    shouldReconnect: (e) => e.code !== 4001 && e.code !== 4003,
  });
  return manager;
}

/**
 * Register a consumer and connect (if not already connected).
 * Returns a consumer ID that must be passed to `removeConsumer()` on unmount.
 */
export function addConsumer(auth: ChatAuth, cbs: ChatWsCallbacks): ConsumerId {
  const id = String(++nextConsumerId);
  consumers.set(id, cbs);
  authPayload = auth;
  ensureManager().connect();
  return id;
}

/**
 * Remove a consumer. If no consumers remain, disconnect.
 */
export function removeConsumer(id: ConsumerId) {
  consumers.delete(id);
  if (consumers.size === 0) {
    disconnect();
  }
}

/** Legacy connect — sets a single consumer (last wins if called multiple times) */
export function connect(auth: ChatAuth, cbs: ChatWsCallbacks) {
  // Keep backward compat: register as consumer "legacy"
  consumers.set('legacy', cbs);
  authPayload = auth;
  ensureManager().connect();
}

export function disconnect() {
  manager?.close();
  manager = null;
  setStatus('disconnected');
  authPayload = null;
  joinedPools.clear();
  dmSubscribed = false;
}

export function joinPool(poolAddress: string) {
  joinedPools.add(poolAddress);
  if (status === 'connected') {
    manager?.send({ type: 'join_pool', poolAddress });
  }
}

export function leavePool(poolAddress: string) {
  joinedPools.delete(poolAddress);
  if (status === 'connected') {
    manager?.send({ type: 'leave_pool', poolAddress });
  }
}

export function sendPoolMessage(poolAddress: string, content: string, replyToId?: string | null) {
  manager?.send({ type: 'pool_message', poolAddress, content, replyToId: replyToId ?? null });
}

export function subscribeDms() {
  dmSubscribed = true;
  if (status === 'connected') {
    manager?.send({ type: 'subscribe_dms' });
  }
}

export function sendDm(to: string, content: string) {
  manager?.send({ type: 'dm', to, content });
}

export function getStatus(): WsStatus {
  return status;
}
