'use client';

import { WagmiProvider, type State } from 'wagmi';
import { type ReactNode } from 'react';
import { wagmiConfig } from '@/core/wagmi-config';

export default function Web3Provider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      {children}
    </WagmiProvider>
  );
}
