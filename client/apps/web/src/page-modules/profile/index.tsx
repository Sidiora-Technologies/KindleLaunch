'use client';
import { useAccount } from 'wagmi';
import { redirect } from 'next/navigation';
import { useEffect } from 'react';
import WalletGate from '@/ui/shared/wallet-gate';

function ProfileRedirect() {
  const { address } = useAccount();
  useEffect(() => {
    if (address) { redirect(`/profile/${address}`); }
  }, [address]);
  return null;
}

export default function ProfileModule() {
  return (
    <WalletGate message="Connect your wallet to view your profile">
      <ProfileRedirect />
    </WalletGate>
  );
}
