'use client';

import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'sidiora-sidebar-expanded';

function getSnapshot(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true; // default expanded for SSR
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  // Cross-tab sync via storage event
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) emitChange();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Reactive sidebar state backed by localStorage.
 * - No polling intervals.
 * - No MutationObserver.
 * - Cross-tab sync via `storage` event.
 * - Same-tab sync via `useSyncExternalStore` + emitChange().
 */
export function useSidebarState() {
  const expanded = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !getSnapshot();
    localStorage.setItem(STORAGE_KEY, String(next));
    emitChange();
  }, []);

  const setExpanded = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    emitChange();
  }, []);

  return { expanded, toggle, setExpanded } as const;
}
