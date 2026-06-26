'use client';

import '@/core/iframe-bridge-init';
import { type ReactNode } from 'react';
import { type State } from 'wagmi';
import QueryProvider from './query-provider';
import Web3Provider from './web3-provider';
import PnlAttribution from './pnl-attribution';
import { PaxeerProvider } from '@/core/wallet-sdk';
import PaxeerWagmiBridge from './paxeer-wagmi-bridge';
import ToastProvider from '@/ui/shared/toast-provider';

export default function AppProviders({
  children,
  wagmiInitialState,
}: {
  children: ReactNode;
  wagmiInitialState?: State;
}) {
  return (
    <QueryProvider>
      <Web3Provider initialState={wagmiInitialState}>
        <PaxeerProvider>
          <PaxeerWagmiBridge />
          <PnlAttribution />
          <ToastProvider />
          {children}
        </PaxeerProvider>
      </Web3Provider>
    </QueryProvider>
  );
}
