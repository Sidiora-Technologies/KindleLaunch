'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useReadQuoterGetPoolsByCreator } from '@/core/network/contracts';
import { formatAddress } from '@/utils/format';
import { sdkBaseUrls } from '@/core/sdk-config';
import TxFeed from '@/widgets/trading/tx-feed';
import HoldersPanel from '@/widgets/trading/holders-panel';

interface PoolMeta {
  name?: string;
  symbol?: string;
}

export default function MyTokenView() {
  const { address } = useAccount();
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [poolMetas, setPoolMetas] = useState<Record<string, PoolMeta>>({});

  const { data: pools } = useReadQuoterGetPoolsByCreator(
    { creator: address! },
  );

  const poolList: string[] = Array.isArray(pools) ? pools.map(String) : [];

  useEffect(() => {
    poolList.forEach((addr) => {
      if (poolMetas[addr]) return;
      fetch(`${sdkBaseUrls.metadata}/metadata/${addr}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setPoolMetas((prev) => ({ ...prev, [addr]: { name: d.name, symbol: d.symbol } }));
        })
        .catch(() => {});
    });
  }, [poolList.length]);

  useEffect(() => {
    if (poolList.length > 0 && !selectedPool) {
      setSelectedPool(poolList[0]);
    }
  }, [poolList, selectedPool]);

  return (
    <div className="p-6 text-white space-y-4">
      <h1 className="text-size-16 font-manrope-bold">My Tokens</h1>

      {poolList.length === 0 ? (
        <div className="text-center py-12 text-dark-disabled text-size-13">
          You haven't created any tokens yet.
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2">
            {poolList.map((addr) => {
              const m = poolMetas[addr];
              return (
                <button
                  key={addr}
                  onClick={() => setSelectedPool(addr)}
                  className={`px-3 py-2 rounded-lg text-size-11 font-manrope-bold whitespace-nowrap transition border ${
                    selectedPool === addr
                      ? 'border-pink-middle bg-pink-opacity-1 text-pink-middle'
                      : 'border-dark-gray text-dark-disabled hover:text-half-enabled'
                  }`}
                >
                  {m?.symbol || formatAddress(addr, 4)}
                </button>
              );
            })}
          </div>

          {selectedPool && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="border border-dark-gray rounded-lg p-4">
                  <h3 className="text-size-13 font-manrope-bold mb-2">Token Info</h3>
                  <div className="grid grid-cols-2 gap-2 text-size-11">
                    <span className="text-dark-disabled">Address:</span>
                    <span className="truncate">{selectedPool}</span>
                    <span className="text-dark-disabled">Name:</span>
                    <span>{poolMetas[selectedPool]?.name || '...'}</span>
                    <span className="text-dark-disabled">Symbol:</span>
                    <span>{poolMetas[selectedPool]?.symbol || '...'}</span>
                  </div>
                </div>
                <HoldersPanel poolAddress={selectedPool} />
              </div>
              <TxFeed poolAddress={selectedPool} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
