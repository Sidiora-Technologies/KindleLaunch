'use client';

import { useState, useRef } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { formatAddress } from '@/utils/format';
import WalletModal from './wallet-modal';
import WalletConnectModal from './wallet-connect-modal';

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (isConnected && address) {
    return (
      <>
        <button
          ref={btnRef}
          onClick={() => setAccountModalOpen(true)}
          className="flex items-center gap-2 border border-dark-gray rounded-lg px-3 py-1.5 bg-dark-gray2 hover:bg-dark-gray transition text-size-12"
        >
          <span className="w-2 h-2 rounded-full bg-green-middle flex-shrink-0" />
          <span className="text-half-enabled font-manrope-bold">
            {formatAddress(address)}
          </span>
        </button>
        <WalletModal
          open={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
          address={address}
          onDisconnect={() => { disconnect(); setAccountModalOpen(false); }}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setConnectModalOpen(true)}
        className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 bg-green-middle hover:bg-green-middle2 transition text-size-12"
      >
        <span className="text-black-gray font-manrope-bold">Sign in</span>
      </button>
      <WalletConnectModal open={connectModalOpen} onClose={() => setConnectModalOpen(false)} />
    </>
  );
}
