'use client';

import { useState } from "react";
import Button from "@/ui/atoms/Button";
import Table from "./Table";
import FullHeightScrollable from "@/ui/atoms/FullHeightScrolable";
import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatAddress, safeFixed } from "@/utils/format";

import Img1 from "@/assets/icons/Group 427320986.svg"
import Img2 from "@/assets/icons/Group 427320987.svg"
import Img3 from "@/assets/icons/Group 427320988.svg"
import filterImg from "@/assets/icons/filter.svg"

type BottomTab = 'trades' | 'holders' | 'top_traders';
type TradeFilter = 'all' | 'mine' | 'dev' | 'kol' | 'tracked';

const TRADE_FILTERS: { key: TradeFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mine', label: 'Mine' },
    { key: 'dev', label: 'Dev' },
    { key: 'kol', label: 'KOL' },
    { key: 'tracked', label: 'Tracked' },
];

const TableComponent = () => {
    const [tab, setTab] = useState<BottomTab>('trades');
    const [tradeFilter, setTradeFilter] = useState<TradeFilter>('all');
    const holderCount = useTerminalStore((s) => s.holderCount);
    const holders = useTerminalStore((s) => s.holders);

    const tabs: { key: BottomTab; label: string }[] = [
        { key: 'trades', label: 'Trades' },
        { key: 'holders', label: `Holders (${holderCount})` },
        { key: 'top_traders', label: 'Top Traders' },
    ];

    return (
        <div className="rounded-md bg-black-gray text-size-12 font-manrope-bold text-dark-disabled">
            <div className="border-b-1 border-dark-gray w-full flex flex-wrap justify-between items-center">
                <ul className="flex flex-wrap -mb-0.5 text-center mx-1 mt-1">
                    {tabs.map((t) => (
                        <li key={t.key}>
                            <button
                                onClick={() => setTab(t.key)}
                                className={`px-2.5 py-1.5 text-size-10 font-manrope-bold transition border-b-2 ${
                                    tab === t.key
                                        ? 'text-white border-pink-middle'
                                        : 'text-dark-disabled border-transparent hover:text-half-enabled'
                                }`}
                            >
                                {t.label}
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="flex items-center gap-1 mx-2 py-1">
                    {tab === 'trades' && (
                        <div className="flex items-center gap-0.5 mr-2">
                            {TRADE_FILTERS.map((f) => (
                                <button
                                    key={f.key}
                                    onClick={() => setTradeFilter(f.key)}
                                    className={`px-2 py-0.5 rounded text-size-9 font-manrope-bold transition ${
                                        tradeFilter === f.key
                                            ? 'bg-pink-middle/15 text-pink-middle'
                                            : 'text-dark-disabled hover:text-half-enabled'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <Button icon={Img2} />
                    <Button icon={Img3} />
                    <Button icon={Img1} content='Instant Trade' fontSize="text-size-8" textColor="pink" border="border-pink-middle rounded-sm" paddingCustom="px-0.5" custom="min-w-20"/>
                </div>
            </div>

            {tab === 'trades' && (
                <FullHeightScrollable offset={400}>
                    <Table />
                </FullHeightScrollable>
            )}

            {tab === 'holders' && (
                <FullHeightScrollable offset={400}>
                    <div className="min-w-full">
                        <table className="min-w-full divide-y-2 divide-dark-gray text-size-11 font-manrope-bold text-dark-disabled w-full text-left">
                            <thead className="bg-dark-gray5">
                                <tr>
                                    <th className="px-4 py-2">#</th>
                                    <th className="px-4 py-2">Address</th>
                                    <th className="px-4 py-2 text-right">% Supply</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-dark-gray">
                                {holders.length === 0 && (
                                    <tr><td colSpan={3} className="px-4 py-6 text-center text-dark-disabled">No holders data</td></tr>
                                )}
                                {holders.map((h, idx) => (
                                    <tr key={h.address} className="h-8 text-half-enabled">
                                        <td className="px-4 py-1.5">{idx + 1}</td>
                                        <td className="px-4 py-1.5">
                                            <div className="flex items-center gap-2">
                                                <a
                                                    href={`https://paxscan.paxeer.app/address/${h.address}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="hover:text-pink-middle transition"
                                                >
                                                    {formatAddress(h.address, 6)}
                                                </a>
                                                {h.isContract && (
                                                    <span className="text-size-8 text-dark-disabled px-1 py-0.5 rounded bg-dark-gray">contract</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-1.5 text-right text-white">{safeFixed(h.pctOfSupply, 2)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </FullHeightScrollable>
            )}

            {tab === 'top_traders' && (
                <div className="px-4 py-8 text-center text-dark-disabled text-size-11">
                    Top traders data coming soon
                </div>
            )}
        </div>
    );
  };
  
  export default TableComponent;