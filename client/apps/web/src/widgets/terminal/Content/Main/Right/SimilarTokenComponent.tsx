'use client';

import Accordion from "@/ui/atoms/Accordion";
import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatPrice, formatVolume, formatAddress } from "@/utils/format";

const SimilarTokenComponent = () => {
    const trendingTokens = useTerminalStore((s) => s.trendingTokens);
    const batchStats = useTerminalStore((s) => s.batchStats);
    const batchMetadata = useTerminalStore((s) => s.batchMetadata);
    const selectedPool = useTerminalStore((s) => s.selectedPool);
    const selectPool = useTerminalStore((s) => s.selectPool);

    const otherTokens = trendingTokens.filter((t) => t.poolAddress !== selectedPool).slice(0, 7);

    return (
        <Accordion>
            <div className="overflow-y-scroll h-50">
                <div className="flex flex-col gap-2">
                    {otherTokens.length === 0 && (
                        <div className="py-4 text-center text-dark-disabled text-size-11">No other tokens</div>
                    )}
                    {otherTokens.map((item) => {
                        const poolStats = batchStats[item.poolAddress] || item.stats;
                        const tokenAddr = (poolStats as any)?.tokenAddress || '';
                        const meta = tokenAddr ? batchMetadata[tokenAddr] : undefined;

                        return (
                            <button
                                key={item.poolAddress}
                                onClick={() => selectPool(item.poolAddress)}
                                className="flex items-center gap-2 p-2 rounded-md border border-dark-gray hover:bg-dark-gray/30 transition text-left"
                            >
                                <div className="w-6 h-6 rounded-full bg-dark-gray flex-shrink-0 flex items-center justify-center overflow-hidden">
                                    <img src={meta?.images?.logo || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-size-11 text-white font-manrope-bold truncate">
                                        {meta?.symbol || formatAddress(item.poolAddress, 3)}
                                    </span>
                                    <span className="text-size-9 text-dark-disabled">
                                        {poolStats ? formatVolume((poolStats as any).marketCap) : '---'} MC
                                    </span>
                                </div>
                                <div className="text-size-10 text-white font-manrope-bold flex-shrink-0">
                                    {poolStats ? formatPrice((poolStats as any).price) : '---'}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </Accordion>
    );
  };
  
  export default SimilarTokenComponent;