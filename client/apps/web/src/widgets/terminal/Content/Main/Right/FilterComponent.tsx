'use client';

import Image from "next/image";

import targetImg from "@/assets/icons/target.svg";
import groupImg from "@/assets/icons/group3.svg";
import windImg from "@/assets/icons/wind.svg";
import leaveImg from "@/assets/icons/leave.svg";
import repoImg from "@/assets/icons/box_svgrepo.com.svg";
import fireImg from "@/assets/icons/fire.svg";
import group2Img from "@/assets/icons/group2.svg";
import warnImg from "@/assets/icons/warn.svg";
import filterImg from "@/assets/icons/filter.svg";

import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatAddress, safeFixed } from "@/utils/format";

const FilterComponent = () => {
    const stats = useTerminalStore((s) => s.stats);
    const metadata = useTerminalStore((s) => s.metadata);

    const top10 = useTerminalStore((s) => s.derivedTop10Conc);
    const devH = useTerminalStore((s) => s.derivedCreatorPct);
    const holders = useTerminalStore((s) => s.holderCount);
    const risk = stats?.riskRating ?? 0;
    const creator = metadata?.creator || '';

    return (
        <div className="rounded-md border-dark-gray border-1 p-2.5 flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-2 text-size-11 text-dark-disabled">
                <div className="border-1 rounded-md border-dark-gray p-2 bg-gradient-black-gray flex flex-col justify-center items-center">
                    <div className="flex justify-center items-center gap-1">
                        <Image src={targetImg} alt="target" />
                        <span className="text-white">{risk}/100</span>
                    </div>
                    <span className="text-size-8">Risk</span>
                </div>
                <div className="border-1 rounded-md border-dark-gray p-2 bg-gradient-black-gray flex flex-col justify-center items-center">
                    <div className="flex justify-center items-center gap-1">
                        <Image src={groupImg} alt="group" />
                        <span className="text-yellow-middle2">{safeFixed(top10, 1)}%</span>
                    </div>
                    <span className="text-size-8">Top 10H.</span>
                </div>
                <div className="border-1 rounded-md border-dark-gray p-2 bg-gradient-black-gray flex flex-col justify-center items-center">
                    <div className="flex justify-center items-center gap-1">
                        <Image src={windImg} alt="wind" />
                        <span className="text-red-middle">---</span>
                    </div>
                    <span className="text-size-8">Insiders</span>
                </div>
                <div className="border-1 rounded-md border-dark-gray p-2 bg-gradient-black-gray flex flex-col justify-center items-center">
                    <div className="flex justify-center items-center gap-1">
                        <Image src={leaveImg} alt="leave" />
                        <span className="text-green-middle4">{safeFixed(devH, 1)}%</span>
                    </div>
                    <span className="text-size-8">Dev H</span>
                </div>
                <div className="border-1 rounded-md border-dark-gray p-2 bg-gradient-black-gray flex flex-col justify-center items-center">
                    <div className="flex justify-center items-center gap-1">
                        <Image src={repoImg} alt="repo" />
                        <span className="text-white">---</span>
                    </div>
                    <span className="text-size-8">Bundlers</span>
                </div>
                <div className="border-1 rounded-md border-dark-gray p-2 bg-gradient-black-gray flex flex-col justify-center items-center">
                    <div className="flex justify-center items-center gap-1">
                        <Image src={fireImg} alt="fire" />
                        <span className="text-white">---</span>
                    </div>
                    <span className="text-size-8">LP Burned</span>
                </div>
                <div className="border-1 rounded-md border-dark-gray p-2 bg-gradient-black-gray flex flex-col justify-center items-center">
                    <div className="flex justify-center items-center gap-1">
                        <Image src={group2Img} alt="group" />
                        <span className="text-white">{holders.toLocaleString()}</span>
                    </div>
                    <span className="text-size-8">Holders</span>
                </div>
                <div className="border-1 rounded-md border-dark-gray p-2 bg-gradient-black-gray flex flex-col justify-center items-center">
                    <div className="flex justify-center items-center gap-1">
                        <Image src={warnImg} alt="risk" />
                        <span className={risk > 60 ? "text-red-middle" : risk > 30 ? "text-yellow-middle" : "text-green-middle"}>
                            {risk > 60 ? 'High' : risk > 30 ? 'Med' : 'Low'}
                        </span>
                    </div>
                    <span className="text-size-8">Risk Lvl</span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-size-10 text-dark-disabled">
                <div className="border-1 rounded-md border-dark-gray px-2 py-1 bg-gradient-black-gray flex justify-between items-center">
                    <span>Creator</span>
                    <div className="flex justify-center items-center gap-2">
                        <span>{creator ? formatAddress(creator, 4) : '---'}</span>
                        <div className="rounded-sm bg-dark-gray p-0.5 hover:bg-gray-800 transition">
                            <Image src={filterImg} alt="filter" />
                        </div>
                    </div>
                </div>
                <div className="border-1 rounded-md border-dark-gray px-2 py-1 bg-gradient-black-gray flex justify-between items-center">
                    <span>Token</span>
                    <div className="flex justify-center items-center gap-2">
                        <span>{stats?.tokenAddress ? formatAddress(stats.tokenAddress, 4) : '---'}</span>
                        <div className="rounded-sm bg-dark-gray p-0.5 hover:bg-gray-800 transition">
                            <Image src={filterImg} alt="filter" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
  };
  
  export default FilterComponent;