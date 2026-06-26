'use client';

import { useState, useEffect, useRef } from 'react';
import { formatAddress } from '@/utils/format';
import Link from 'next/link';

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
  address: string;
  onDisconnect: () => void;
}

export default function WalletModal({ open, onClose, address, onDisconnect }: WalletModalProps) {
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(t);
    }
  }, [copied]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {}
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-end pt-14 pr-4"
    >
      <div
        className="bg-dark-gray4 border border-dark-gray rounded-xl shadow-2xl w-72 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
      >
        <div className="px-4 pt-4 pb-3 border-b border-dark-gray">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-dark-gray flex items-center justify-center flex-shrink-0">
              <img src="/icons/avatar.svg" alt="" width={18} height={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-size-12 font-manrope-bold text-half-enabled truncate">
                {formatAddress(address, 6)}
              </p>
              <p className="text-size-10 text-dark-disabled flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-middle inline-block" />
                Connected
              </p>
            </div>
          </div>
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-dark-gray hover:bg-dark-gray7 transition text-size-11"
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-green-middle">
                  <path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-green-middle font-manrope-bold">Copied</span>
              </>
            ) : (
              <>
                <img src="/icons/copy.svg" alt="" width={14} height={14} />
                <span className="text-half-enabled font-manrope-bold">Copy Address</span>
              </>
            )}
          </button>
        </div>

        <div className="p-2 flex flex-col gap-0.5">
          <Link
            href={`/profile/${address}`}
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-dark-gray/60 transition"
          >
            <img src="/icons/avatar_dark.svg" alt="" width={16} height={16} />
            <span className="text-size-12 text-half-enabled font-manrope-bold">Profile</span>
          </Link>
          <Link
            href="/token"
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-dark-gray/60 transition"
          >
            <img src="/icons/widget.svg" alt="" width={16} height={16} />
            <span className="text-size-12 text-half-enabled font-manrope-bold">My Token</span>
          </Link>
          <Link
            href="/rewards"
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-dark-gray/60 transition"
          >
            <img src="/icons/case.svg" alt="" width={16} height={16} />
            <span className="text-size-12 text-half-enabled font-manrope-bold">Rewards</span>
          </Link>
        </div>

        <div className="p-2 pt-0 border-t border-dark-gray">
          <button
            onClick={onDisconnect}
            className="w-full flex items-center gap-2.5 px-3 py-2 mt-1 rounded-lg hover:bg-red-opacity-015 transition"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-red-middle">
              <path d="M6 2H4C2.89543 2 2 2.89543 2 4V12C2 13.1046 2.89543 14 4 14H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M10.5 5L13.5 8M13.5 8L10.5 11M13.5 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-size-12 text-red-middle font-manrope-bold">Disconnect</span>
          </button>
        </div>
      </div>
    </div>
  );
}
