'use client';

import { type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import WalletButton from '@/shell/wallet-button';

interface WalletGateProps {
  children: ReactNode;
  message?: string;
}

export default function WalletGate({ children, message = 'Connect your wallet to continue' }: WalletGateProps) {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-white">
        <p className="text-half-enabled text-size-14">{message}</p>
        <WalletButton />
      </div>
    );
  }

  return <>{children}</>;
}
