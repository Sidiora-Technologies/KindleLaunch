'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { httpClient as candlesHttp } from 'candles-sdk';
import { httpClient as indexerHttp } from 'indexer-sdk';
import { httpClient as metadataHttp } from 'metadata-sdk';
import { httpClient as rankingHttp } from 'ranking-algo-sdk';
import { httpClient as statsHttp } from 'stats-sdk';
import { httpClient as usersHttp } from 'users-sdk';
import { sdkBaseUrls } from '@/core/sdk-config';
import { cachePolicy } from '@/core/cache-policy';

let sdksConfigured = false;
function configureSDKs() {
  if (sdksConfigured) return;
  candlesHttp.configure({ baseUrl: sdkBaseUrls.candles });
  indexerHttp.configure({ baseUrl: sdkBaseUrls.indexer });
  metadataHttp.configure({ baseUrl: sdkBaseUrls.metadata });
  rankingHttp.configure({ baseUrl: sdkBaseUrls.ranking });
  statsHttp.configure({ baseUrl: sdkBaseUrls.stats });
  usersHttp.configure({ baseUrl: sdkBaseUrls.users });
  sdksConfigured = true;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Default tier for queries that don't opt into a specific policy.
        // FAST = 10s fresh, matching the prior default; see cache-policy.ts.
        staleTime: cachePolicy.FAST.staleTime,
        gcTime: cachePolicy.FAST.gcTime,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchIntervalInBackground: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export default function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  useEffect(() => {
    configureSDKs();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
