'use client';
import WalletGate from '@/ui/shared/wallet-gate';
import CreateWizard from '@/widgets/create/create-wizard';
export default function CreateModule() {
  return (
    <WalletGate message="Connect your wallet to create a token">
      <CreateWizard />
    </WalletGate>
  );
}
