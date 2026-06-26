'use client';

import { useState, useCallback, useEffect } from 'react';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '@/core/clients/watchlist';

export function useWatchlist() {
  const [list, setList] = useState<string[]>([]);

  useEffect(() => {
    getWatchlist().then(setList);
  }, []);

  const toggle = useCallback((poolAddress: string) => {
    if (list.includes(poolAddress)) {
      removeFromWatchlist(poolAddress).then(setList);
    } else {
      addToWatchlist(poolAddress).then(setList);
    }
  }, [list]);

  const check = useCallback((poolAddress: string) => {
    return list.includes(poolAddress);
  }, [list]);

  return { list, toggle, check };
}
