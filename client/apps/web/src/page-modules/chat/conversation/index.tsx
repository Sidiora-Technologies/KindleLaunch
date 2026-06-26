'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import DmThread from '@/widgets/chat/dm-thread';
import Link from 'next/link';

export default function ConversationModule() {
  const params = useParams();
  const { address } = useAccount();
  const conversationId = decodeURIComponent(params.conversationId as string);

  const peerAddress = useMemo(() => {
    if (!conversationId || !address) return '';
    const parts = conversationId.replace('dm:', '').split(':');
    return parts.find(p => p.toLowerCase() !== address.toLowerCase()) || parts[0] || '';
  }, [conversationId, address]);

  return (
    <div className="text-white flex flex-col h-[calc(100vh-60px)] max-w-2xl mx-auto">
      <div className="px-4 pt-3">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1 text-size-11 text-dark-disabled hover:text-half-enabled transition mb-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to messages
        </Link>
      </div>
      <DmThread
        conversationId={conversationId}
        peerAddress={peerAddress}
      />
    </div>
  );
}
