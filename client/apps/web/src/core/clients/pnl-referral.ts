/**
 * Client-side mirror of the backend's `sidiora_ref` cookie.
 *
 * The backend sets `sidiora_ref` as HttpOnly so JS can't read it directly.
 * When a viewer lands on /pnl/{cardId} we write the shortCode to localStorage,
 * so later (e.g. when they come back to sidiora.fun and connect a wallet)
 * we can tell whether attribution is pending and fire `wallet_bind` exactly once
 * per (address, shortCode) pair without spamming the event endpoint.
 *
 * The backend still owns the source of truth via the HttpOnly cookie — this
 * mirror is strictly for client-side UX decisions.
 */

const STORAGE_KEY = 'sidiora_ref_v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches cookie Max-Age

interface ReferralEntry {
  shortCode: string;
  cardId?: string;
  expiresAt: number;
  boundAddresses: string[]; // lowercase
  firstSeenAt: number;
}

function safeReadLocal(): ReferralEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReferralEntry;
    if (!parsed || typeof parsed.shortCode !== 'string') return null;
    if (parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteLocal(entry: ReferralEntry): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // storage full / disabled — swallow; attribution just won't deduplicate
  }
}

/** Seed the local mirror when a user lands on a PNL card page. */
export function rememberReferral(shortCode: string, cardId?: string): void {
  const existing = safeReadLocal();
  const now = Date.now();
  const entry: ReferralEntry = {
    shortCode,
    cardId: cardId ?? existing?.cardId,
    expiresAt: now + TTL_MS,
    boundAddresses: existing?.shortCode === shortCode ? existing.boundAddresses : [],
    firstSeenAt: existing?.shortCode === shortCode ? existing.firstSeenAt : now,
  };
  safeWriteLocal(entry);
}

/** Returns the currently-remembered referral, if any (and not expired). */
export function getRememberedReferral(): { shortCode: string; cardId?: string } | null {
  const entry = safeReadLocal();
  if (!entry) return null;
  return { shortCode: entry.shortCode, cardId: entry.cardId };
}

/** Returns true if this address has already fired wallet_bind for the current referral. */
export function isAddressAlreadyBound(address: string): boolean {
  const entry = safeReadLocal();
  if (!entry) return false;
  return entry.boundAddresses.includes(address.toLowerCase());
}

/** Record that `address` has been bound to the current referral. Idempotent. */
export function markAddressBound(address: string): void {
  const entry = safeReadLocal();
  if (!entry) return;
  const lc = address.toLowerCase();
  if (entry.boundAddresses.includes(lc)) return;
  entry.boundAddresses.push(lc);
  safeWriteLocal(entry);
}

/** Clear the mirror (e.g. on logout or manual reset). */
export function forgetReferral(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
