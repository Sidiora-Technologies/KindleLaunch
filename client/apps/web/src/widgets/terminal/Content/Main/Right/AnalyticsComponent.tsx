'use client';

import { useState } from "react";
import AnalyticstButton from "../../../components/AnalyticsButton";
import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatVolume, formatNumber, safeFixed } from "@/utils/format";

const AnalyticsComponent = () => {
    const [openedTab, setOpenedTab] = useState<string | null>(null);
    const stats = useTerminalStore((s) => s.stats);

    const handleClick = (tabName: string) => {
        setOpenedTab(openedTab === tabName ? null : tabName);
    };

    const buys = stats?.buyCount24h ?? 0;
    const sells = stats?.sellCount24h ?? 0;
    const totalTxns = buys + sells;
    const traders = stats?.uniqueTraders24h ?? 0;
    const vol24h = stats?.volume24h ?? '0';
    const vol1h = stats?.volume1h ?? '0';
    const vol5m = stats?.volume5m ?? '0';
    const priceChange = stats?.priceChange24h ?? '0';

    const getVolume = (tab: string | null) => {
        if (tab === '5M') return vol5m;
        if (tab === '1H') return vol1h;
        return vol24h;
    };

    const buyPct = totalTxns > 0 ? Math.round((buys / totalTxns) * 100) : 50;
    const sellPct = 100 - buyPct;

    return (
        <div className="rounded-lg border-dark-gray border-1">
            <div className={`${openedTab && 'border-b border-dark-gray'}`}>
                <ul className="flex -mb-px text-center justify-around">
                    <li 
                        className="w-[25%]" 
                        onClick={() => handleClick("5M")}
                        aria-expanded={openedTab === "5M"}
                    >
                        <AnalyticstButton 
                            isBuy={true} 
                            isOpened={openedTab === "5M"} 
                            roundSet="focus:rounded-tl-lg" 
                            text1="5M" 
                            text2={formatVolume(vol5m)} 
                        />
                    </li>
                    <div className="border-l-1 border-dark-gray"></div>
                    <li 
                        className="w-[25%]"
                        onClick={() => handleClick("1H")}
                        aria-expanded={openedTab === "1H"}
                    >
                        <AnalyticstButton 
                            isBuy={false}
                            text1="1H" 
                            text2={formatVolume(vol1h)} 
                            isOpened={openedTab === "1H"}
                            roundSet="" 
                        />
                    </li>
                    <div className="border-l-1 border-dark-gray"></div>
                    <li 
                        className="w-[25%]"
                        onClick={() => handleClick("6H")}
                        aria-expanded={openedTab === "6H"}
                    >
                        <AnalyticstButton 
                            isBuy={false}
                            text1="6H" 
                            text2={formatVolume(vol24h)} 
                            isOpened={openedTab === "6H"}
                            roundSet="" 
                        />
                    </li>
                    <div className="border-l-1 border-dark-gray"></div>
                    <li 
                        className="w-[25%]"
                        onClick={() => handleClick("24H")}
                        aria-expanded={openedTab === "24H"}
                    >
                        <AnalyticstButton 
                            isBuy={parseFloat(priceChange) >= 0}
                            isOpened={openedTab === "24H"} 
                            roundSet="focus:rounded-tr-lg" 
                            text1="24H" 
                            text2={`${parseFloat(priceChange) >= 0 ? '+' : ''}${safeFixed(parseFloat(priceChange), 1)}%`}
                        />
                    </li>
                </ul>
            </div>
            
            <div 
                className={`flex justify-center space-x-4 overflow-hidden transition-all duration-200
                    ${openedTab ? 'max-h-screen p-4' : 'max-h-0'}`}
                id="accordion-content"
            >
                {openedTab && (
                    <>
                        <div className="border-1 border-dark-gray bg-gradient-black-gray rounded-lg w-[20%] flex flex-col p-2 justify-between gap-2">
                            <div className="flex flex-col">
                                <span className="font-manrope-medium text-size-9 text-dark-gray3">Txns</span>
                                <span className="font-manrope-medium text-size-9 text-white">{formatNumber(totalTxns)}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-manrope-medium text-size-9 text-dark-gray3">Volume</span>
                                <span className="font-manrope-medium text-size-9 text-white">{formatVolume(getVolume(openedTab))}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-manrope-medium text-size-9 text-dark-gray3">Makers</span>
                                <span className="font-manrope-medium text-size-9 text-white">{formatNumber(traders)}</span>
                            </div>
                        </div>

                        <div className="flex flex-col justify-center w-[80%] gap-3">
                            <div className="flex flex-col">
                                <div className="flex justify-between">
                                    <span className="text-dark-gray3 text-size-9">Buys</span>
                                    <span className="text-dark-gray3 text-size-9">Sells</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white text-size-9">{buys.toLocaleString()}</span>
                                    <span className="text-white text-size-9">{sells.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-center items-center w-full space-x-[1%] mt-2">
                                    <div className="rounded-lg h-[3] bg-green-middle3" style={{width: `${buyPct}%`}}></div>
                                    <div className="rounded-lg h-[3] bg-red-middle" style={{width: `${sellPct}%`}}></div>
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <div className="flex justify-between">
                                    <span className="text-dark-gray3 text-size-9">Traders</span>
                                    <span className="text-dark-gray3 text-size-9">Holders</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white text-size-9">{traders.toLocaleString()}</span>
                                    <span className="text-white text-size-9">{(stats?.holderCount ?? 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-center items-center w-full space-x-[1%] mt-2">
                                    <div className="rounded-lg h-[3] bg-green-middle3" style={{width: `${traders > 0 ? 60 : 50}%`}}></div>
                                    <div className="rounded-lg h-[3] bg-red-middle" style={{width: `${traders > 0 ? 40 : 50}%`}}></div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AnalyticsComponent;