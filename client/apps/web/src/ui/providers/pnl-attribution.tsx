'use client';

import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { logEvent } from '@/core/clients/pnl';
import {
  getRememberedReferral,
  isAddressAlreadyBound,
  markAddressBound,
} from '@/core/clients/pnl-referral';

/**
 * Fires `wallet_bind` exactly once per (address, shortCode) pair when a viewer
 * who previously landed on a PNL card connects their wallet.
 *
 * Safe to mount at the app root — does nothing when:
 *   - no referral is remembered in localStorage (user never came via a card)
 *   - the viewer's wallet is already bound to the current referral
 *   - wallet is disconnected
 *
 * Self-referrals (walletAddress === owner(shortCode)) are dropped server-side.
 */
export default function PnlAttribution() {
  const { address, isConnected } = useAccount();
  const firedLocal = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isConnected || !address) return;

    const lc = address.toLowerCase();
    if (firedLocal.current.has(lc)) return;

    const referral = getRememberedReferral();
    if (!referral) return;

    if (isAddressAlreadyBound(address)) {
      firedLocal.current.add(lc);
      return;
    }

    firedLocal.current.add(lc);
    logEvent({
      type: 'wallet_bind',
      walletAddress: address,
      shortCode: referral.shortCode,
      cardId: referral.cardId,
    }).then(() => {
      markAddressBound(address);
    });
  }, [address, isConnected]);

  return null;
}
