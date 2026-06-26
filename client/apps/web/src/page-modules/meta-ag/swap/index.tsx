import BestRouteSwapPanel from '@/widgets/meta-ag/best-route-swap';
import Link from 'next/link';

export default function MetaAgSwapModule() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center px-4 pt-6 pb-20 gap-6">
      <div className="w-full max-w-[480px]">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-size-20 font-manrope-bold text-white">Meta-AG Swap</h1>
          <Link
            href="/swap"
            className="text-size-11 text-dark-disabled hover:text-white transition underline-offset-2 hover:underline"
          >
            Use legacy router →
          </Link>
        </div>
        <p className="text-size-12 text-dark-disabled mb-5">
          Routes via the on-chain aggregator across the PECOR Vault and the
          Sidiora Launchpad AMM. The lower-cost adapter wins per quote — the
          UI shows which one is selected.
        </p>
      </div>
      <BestRouteSwapPanel />
      <div className="w-full max-w-[480px] text-size-10 text-dark-disabled space-y-1">
        <div className="flex justify-between">
          <span>Router</span>
          <span className="font-manrope-bold text-half-enabled">0x732A…6449</span>
        </div>
        <div className="flex justify-between">
          <span>Quoter</span>
          <span className="font-manrope-bold text-half-enabled">0x5266…CC90</span>
        </div>
        <div className="flex justify-between">
          <span>Adapters</span>
          <span className="font-manrope-bold text-half-enabled">VaultAdapter + SidioraAdapter</span>
        </div>
      </div>
    </div>
  );
}
