'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { httpClient as candlesHttp } from 'candles-sdk';
import { httpClient as indexerHttp } from 'indexer-sdk';
import { httpClient as metadataHttp } from 'metadata-sdk';
import { httpClient as rankingHttp } from 'ranking-algo-sdk';
import { httpClient as statsHttp } from 'stats-sdk';
import { httpClient as usersHttp } from 'users-sdk';
import { dataApiUrl, metadataApiUrl, userApiUrl } from '@/core/sdk-config';
import { cachePolicy } from '@/core/cache-policy';

let sdksConfigured = false;
function configureSDKs() {
  if (sdksConfigured) return;
  // Each SDK appends its own resource path (e.g. `/history`, `/metadata/{addr}`,
  // `/users/{addr}`), so baseUrl is the HOST ROOT (plus the `/udf` segment the
  // candles SDK does NOT add). Pointing at host roots fixes the legacy doubled
  // `/metadata/metadata` and `/users/users` 404s.
  candlesHttp.configure({ baseUrl: dataApiUrl('/udf') });
  indexerHttp.configure({ baseUrl: dataApiUrl('') });
  metadataHttp.configure({ baseUrl: metadataApiUrl('') });
  rankingHttp.configure({ baseUrl: dataApiUrl('') });
  statsHttp.configure({ baseUrl: dataApiUrl('') });
  usersHttp.configure({ baseUrl: userApiUrl('') });
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
