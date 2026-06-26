'use client';

/**
 * PaxeerWagmiBridge — bridges Supabase auth state into wagmi.
 *
 * The Paxeer Embedded Wallet's source of truth is the Supabase session held
 * by `PaxeerProvider`. wagmi has no idea about Supabase, so when the user
 * signs in (or returns from an OAuth redirect with a hydrated session), we
 * need to flip wagmi to use the `paxeer-embedded` connector.
 *
 * This component renders nothing — it just runs effects:
 *   - on session ready + publicWallet known + wagmi disconnected
 *       → wagmi.connect({ connector: paxeer-embedded })
 *   - on Supabase signOut while wagmi is connected via Paxeer
 *       → wagmi.disconnect() (no signOut loop — provider already cleared)
 */

import { useEffect, useRef } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { usePaxeer } from '@/core/wallet-sdk';
import { PAXEER_CONNECTOR_ID } from '@/core/wallet-sdk';

export default function PaxeerWagmiBridge() {
  const { session, publicWallet, isLoading } = usePaxeer();
  const { connector: activeConnector, isConnected } = useAccount();
  const { connectors, connectAsync, status: connectStatus } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const lastAttemptRef = useRef<string | null>(null);

  // Auto-connect wagmi to the Paxeer connector once we have a hydrated session.
  useEffect(() => {
    if (isLoading) return;
    if (!session || !publicWallet) return;
    if (isConnected && activeConnector?.id === PAXEER_CONNECTOR_ID) return;
    if (connectStatus === 'pending') return;

    const paxConnector = connectors.find((c) => c.id === PAXEER_CONNECTOR_ID);
    if (!paxConnector) return;

    // Avoid re-attempting on every render for the same session.
    const key = `${publicWallet.address}:${session.user.id}`;
    if (lastAttemptRef.current === key) return;
    lastAttemptRef.current = key;

    void connectAsync({ connector: paxConnector }).catch((err) => {
      console.warn('[paxeer] wagmi auto-connect failed:', err);
    });
  }, [isLoading, session, publicWallet, isConnected, activeConnector?.id, connectStatus, connectAsync, connectors]);

  // If Supabase signs the user out (e.g. token expired) while wagmi still
  // thinks it's connected through Paxeer, drop wagmi too.
  useEffect(() => {
    if (isLoading) return;
    if (session) return;
    if (!isConnected) return;
    if (activeConnector?.id !== PAXEER_CONNECTOR_ID) return;

    void disconnectAsync().catch(() => {});
    lastAttemptRef.current = null;
  }, [isLoading, session, isConnected, activeConnector?.id, disconnectAsync]);

  return null;
}
