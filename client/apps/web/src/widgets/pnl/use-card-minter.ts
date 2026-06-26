'use client';

import { useCallback, useState } from 'react';
import { mintCard, PnlApiError, type MintedCard } from '@/core/clients/pnl';

export type MintState =
  | { kind: 'idle' }
  | { kind: 'minting' }
  | { kind: 'ready'; card: MintedCard }
  | { kind: 'error'; message: string };

/**
 * One-click card mint. No signature — backend gates on position existence.
 * Caller is responsible for rendering the share modal when `state.kind === 'ready'`
 * (or reading `card` after mint resolves).
 */
export function useCardMinter() {
  const [state, setState] = useState<MintState>({ kind: 'idle' });

  const mint = useCallback(
    async (args: { ownerAddress: string; poolAddress: string }): Promise<MintedCard | null> => {
      if (!args.ownerAddress || !args.poolAddress) return null;
      setState({ kind: 'minting' });
      try {
        const card = await mintCard(args);
        setState({ kind: 'ready', card });
        return card;
      } catch (e) {
        const message =
          e instanceof PnlApiError
            ? e.status === 400
              ? 'No position found — make a trade first.'
              : `Mint failed (${e.status})`
            : 'Mint failed — check your connection.';
        setState({ kind: 'error', message });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { mint, reset, state, card: state.kind === 'ready' ? state.card : null };
}
