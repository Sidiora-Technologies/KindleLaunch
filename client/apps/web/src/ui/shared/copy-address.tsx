'use client';

import { useState } from 'react';
import { formatAddress } from '@/utils/format';

interface CopyAddressProps {
  address: string;
  chars?: number;
  className?: string;
}

export default function CopyAddress({ address, chars = 4, className = '' }: CopyAddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-dark-disabled hover:text-half-enabled transition ${className}`}
      title={address}
    >
      <span className="text-size-10">{formatAddress(address, chars)}</span>
      <span className="text-size-9">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
