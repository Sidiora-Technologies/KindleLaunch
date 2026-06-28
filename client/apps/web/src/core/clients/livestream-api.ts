import { gatewayUrl } from '@/core/sdk-config';

// NOTE: media/livestream has no dedicated public host in the 2026-06-27 mapping
// and the gateway does not yet proxy `/livestream`. Pointed at the gateway as a
// placeholder + env override (NEXT_PUBLIC_LIVESTREAM_API_URL) pending a backend
// host/proxy decision; live-stream features stay degraded until then.
const API =
  (process.env.NEXT_PUBLIC_LIVESTREAM_API_URL || '').replace(/\/$/, '') ||
  gatewayUrl('/livestream');

export interface StreamPublic {
  id: string;
  poolAddress: string;
  creatorWallet: string;
  title: string;
  playbackUrl: string;
  playbackId: string;
  isLive: boolean;
  viewerCount: number;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
}

export interface CreateStreamResponse {
  id: string;
  streamKey: string;
  rtmpUrl: string;
  playbackUrl: string;
  playbackId: string;
}

interface AuthBody {
  wallet: string;
  signature: string;
  message: string;
  nonce?: string;
  expiresAt?: string;
}

export async function createStream(
  poolAddress: string,
  title: string,
  auth: AuthBody,
): Promise<CreateStreamResponse | null> {
  const res = await fetch(`${API}/streams`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ poolAddress, title, ...auth }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getLiveStreams(): Promise<StreamPublic[]> {
  const res = await fetch(`${API}/streams/live`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.streams ?? [];
}

export async function getPoolStreams(
  poolAddress: string,
  liveOnly = false,
): Promise<StreamPublic[]> {
  const url = `${API}/streams/pool/${poolAddress}${liveOnly ? '?live=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.streams ?? [];
}

export async function getStream(streamId: string): Promise<StreamPublic | null> {
  const res = await fetch(`${API}/streams/${streamId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function goLive(streamId: string, auth: AuthBody): Promise<boolean> {
  const res = await fetch(`${API}/streams/${streamId}/go-live`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(auth),
  });
  return res.ok;
}

export async function endStream(streamId: string, auth: AuthBody): Promise<boolean> {
  const res = await fetch(`${API}/streams/${streamId}/end`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(auth),
  });
  return res.ok;
}
