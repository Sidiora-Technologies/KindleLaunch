'use client';

import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatVolume } from "@/utils/format";

const StatisticComponent = () => {
    const stats = useTerminalStore((s) => s.stats);

    const vol = stats?.volume24h ?? '0';
    const buys = stats?.buyCount24h ?? 0;
    const sells = stats?.sellCount24h ?? 0;
    const holders = useTerminalStore((s) => s.holderCount);

    return (
        <div className="rounded-md border-dark-gray border-1">
            <ul className="flex text-center justify-around text-size-10 text-dark-gray3">
                <li className="w-[25%] flex flex-col justify-center items-center py-2">
                    <span>Buys</span>
                    <span className="text-size-11 text-green-middle3">{buys}</span>
                </li>
                <div className="border-l-1 border-dark-gray"></div>
                <li className="w-[25%] flex flex-col justify-center items-center">
                    <span>Sells</span>
                    <span className="text-size-11 text-red-middle">{sells}</span>
                </li>
                <div className="border-l-1 border-dark-gray"></div>
                <li className="w-[25%] flex flex-col justify-center items-center">
                    <span>Holders</span>
                    <span className="text-size-11 text-white">{holders}</span>
                </li>
                <div className="border-l-1 border-dark-gray"></div>
                <li className="w-[25%] flex flex-col justify-center items-center">
                    <span>Vol 24h</span>
                    <span className="text-size-11 text-green-middle3">{formatVolume(vol)}</span>
                </li>
            </ul>
        </div>
    );
  };
  
  export default StatisticComponent;