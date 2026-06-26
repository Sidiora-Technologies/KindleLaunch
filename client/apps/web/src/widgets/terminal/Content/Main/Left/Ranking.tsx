'use client';

import { useState } from 'react';
import { useTerminalStore } from '@/utils/stores/terminalStore';
import { formatPrice, formatVolume, formatAddress } from '@/utils/format';

const TIME_FILTERS = ['1M', '5M', '30M', '1H'] as const;

const Ranking = () => {
    const [activeFilter, setActiveFilter] = useState<string>('5M');
    const stats = useTerminalStore((s) => s.stats);
    const metadata = useTerminalStore((s) => s.metadata);
    const selectedPool = useTerminalStore((s) => s.selectedPool);

    const symbol = metadata?.symbol || '';
    const name = metadata?.name || '';
    const logoSrc = metadata?.images?.logo;
    const mcap = stats?.marketCap ? formatVolume(stats.marketCap) : '---';
    const price = stats?.price ? formatPrice(stats.price) : '---';

    return (
        <div className="flex flex-col gap-1.5">
            {/* Trending header + time filters */}
            <div className="flex items-center justify-between">
                <span className="text-size-12 font-manrope-bold text-white">Trending</span>
                <div className="flex items-center gap-0.5">
                    {TIME_FILTERS.map((f) => (
                        <button
                            key={f}
                            onClick={() => setActiveFilter(f)}
                            className={`px-1.5 py-0.5 rounded text-size-9 font-manrope-bold transition ${
                                activeFilter === f
                                    ? 'bg-pink-middle/15 text-pink-middle'
                                    : 'text-dark-disabled hover:text-half-enabled'
                            }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Selected pair info — like padre.gg "Pair Info / Market Cap" */}
            {selectedPool && (
                <div className="rounded-lg border border-dark-gray bg-gradient-black-gray p-2">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-dark-gray flex-shrink-0 overflow-hidden">
                            <img src={logoSrc || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                                <span className="text-size-11 font-manrope-bold text-white truncate">{symbol || name || formatAddress(selectedPool, 4)}</span>
                                {symbol && name && name !== symbol && (
                                    <span className="text-size-9 text-dark-disabled truncate">{name}</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-size-9">
                                <span className="text-dark-disabled">MC: <span className="text-white">{mcap}</span></span>
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <span className="text-size-11 font-manrope-bold text-white">{price}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
  
export default Ranking;