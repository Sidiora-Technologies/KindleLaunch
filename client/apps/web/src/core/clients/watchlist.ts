import { sdkBaseUrls } from '@/core/sdk-config';

const STORAGE_KEY = 'sidiora_watchlist';

/**
 * 3.2: Server-side watchlist with localStorage fallback for unauthenticated users.
 */

function getLocalWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalWatchlist(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* noop */ }
}

export async function getWatchlist(walletAddress?: string): Promise<string[]> {
  if (!walletAddress) return getLocalWatchlist();
  try {
    const res = await fetch(`${sdkBaseUrls.users}/users/${walletAddress}/watchlist`);
    if (!res.ok) return getLocalWatchlist();
    const data = await res.json();
    return (data.pools ?? []) as string[];
  } catch {
    return getLocalWatchlist();
  }
}

export async function addToWatchlist(
  poolAddress: string,
  walletAddress?: string,
  signature?: string,
  message?: string,
): Promise<string[]> {
  if (!walletAddress || !signature || !message) {
    const list = getLocalWatchlist();
    if (!list.includes(poolAddress)) {
      list.push(poolAddress);
      setLocalWatchlist(list);
    }
    return list;
  }
  try {
    const res = await fetch(
      `${sdkBaseUrls.users}/users/${walletAddress}/watchlist/${poolAddress}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, message }),
      },
    );
    if (res.ok) {
      const data = await res.json();
      return (data.pools ?? []) as string[];
    }
  } catch { /* fall through */ }
  const list = getLocalWatchlist();
  if (!list.includes(poolAddress)) {
    list.push(poolAddress);
    setLocalWatchlist(list);
  }
  return list;
}

export async function removeFromWatchlist(
  poolAddress: string,
  walletAddress?: string,
  signature?: string,
  message?: string,
): Promise<string[]> {
  if (!walletAddress || !signature || !message) {
    const list = getLocalWatchlist().filter((a) => a !== poolAddress);
    setLocalWatchlist(list);
    return list;
  }
  try {
    const res = await fetch(
      `${sdkBaseUrls.users}/users/${walletAddress}/watchlist/${poolAddress}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, message }),
      },
    );
    if (res.ok) {
      const data = await res.json();
      return (data.pools ?? []) as string[];
    }
  } catch { /* fall through */ }
  const list = getLocalWatchlist().filter((a) => a !== poolAddress);
  setLocalWatchlist(list);
  return list;
}

export async function isWatchlisted(
  poolAddress: string,
  walletAddress?: string,
): Promise<boolean> {
  const list = await getWatchlist(walletAddress);
  return list.includes(poolAddress);
}
