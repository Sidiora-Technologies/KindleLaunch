'use client';

import { useState, useCallback } from 'react';
import OrderForm from '@/widgets/meta-ag/order-form';
import OpenOrdersList from '@/widgets/meta-ag/open-orders-list';

export default function MetaAgOrdersPage() {
  // Bumping this counter on a successful place tells OpenOrdersList to
  // refetch its index lists immediately rather than waiting for wagmi's
  // default polling interval. Keeps the placed-→listed loop tight.
  const [refreshCounter, setRefreshCounter] = useState(0);
  const handlePlaced = useCallback(() => {
    setRefreshCounter((n) => n + 1);
  }, []);

  return (
    <div className="min-h-[calc(100vh-64px)] px-4 pt-6 pb-20 max-w-[1100px] mx-auto">
      <div className="mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-size-20 font-manrope-bold text-white">Orders</h1>
          <span className="text-size-9 px-1.5 py-0.5 rounded bg-pink-middle/15 text-pink-middle border border-pink-middle/30 font-manrope-bold uppercase tracking-wider">
            PECOR
          </span>
        </div>
        <p className="text-size-12 text-dark-disabled mt-1">
          Limit, stop-loss and stop-limit orders settled by the keeper bot
          when oracle prices cross your trigger. Quoted in 18-dec USD via
          OracleHub.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">
        <div>
          <OrderForm onPlaced={handlePlaced} />
          <KeeperHealthHint />
        </div>
        <div>
          <OpenOrdersList refreshSignal={refreshCounter} />
        </div>
      </div>
    </div>
  );
}

function KeeperHealthHint() {
  return (
    <div className="mt-3 px-3 py-2.5 rounded-xl border border-dark-gray bg-dark-gray2/30 text-size-10 text-dark-disabled space-y-1">
      <div className="font-manrope-bold uppercase tracking-wider text-half-enabled mb-1">How it works</div>
      <p>
        Your order sits on-chain until the keeper bot detects an oracle
        price crossing your trigger, then it executes against the PECOR
        vault automatically. You can cancel anytime — funds remain in
        custody until execution.
      </p>
      <div className="pt-1.5 mt-1.5 border-t border-dark-gray/50 flex justify-between">
        <span>Keeper</span>
        <span className="font-mono text-half-enabled">0xaA39…36aB</span>
      </div>
      <div className="flex justify-between">
        <span>Orders contract</span>
        <span className="font-mono text-half-enabled">0x16bC…5f6E</span>
      </div>
    </div>
  );
}
