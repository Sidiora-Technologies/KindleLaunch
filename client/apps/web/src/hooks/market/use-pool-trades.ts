'use client';

import { useQuery } from '@tanstack/react-query';
import { sdkBaseUrls } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';
import { reportError } from '@/core/report-error';

export interface PoolTrade {
  id: string;
  sender: string;
  isBuy: boolean;
  amountIn: string;
  amountOut: string;
  price: string;
  blockTimestamp: number;
  txHash?: string;
  fee?: string;
}

type TradeFilter = 'all' | 'buy' | 'sell';

async function fetchPoolTrades(
  poolAddress: string,
  filter: TradeFilter,
  limit: number = 50,
): Promise<PoolTrade[]> {
  const res = await fetch(
    `${sdkBaseUrls.stats}/stats/${poolAddress}/transactions?limit=${limit}&type=${filter}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.transactions ?? [];
}

export function usePoolTrades(
  poolAddress: string,
  filter: TradeFilter = 'all',
  opts?: { refetchInterval?: number; enabled?: boolean },
) {
  return useQuery<PoolTrade[]>({
    queryKey: queryKeys.poolTransactions(poolAddress, filter),
    queryFn: async () => {
      try {
        return await fetchPoolTrades(poolAddress, filter);
      } catch (error) {
        reportError(error, { area: 'usePoolTrades', action: 'fetch', poolAddress });
        return [];
      }
    },
    enabled: opts?.enabled !== false && !!poolAddress,
    refetchInterval: opts?.refetchInterval ?? 5_000,
    refetchIntervalInBackground: false,
    staleTime: 3_000,
  });
}
