import React from "react";
import Image from "next/image";

import dockerImg from "@/assets/icons/Group 427321040.svg";
import filterImg from "@/assets/icons/filter.svg";
import { formatPrice, formatVolume, formatAddress, fromWad, safeFixed } from '@/utils/format';

function timeAgo(ts: number): string {
    if (!ts) return '';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
}

interface TableRowProps {
    isBuy: boolean;
    isHyped?: boolean;
    progress: string;
    price?: string;
    amountIn?: string;
    amountOut?: string;
    sender?: string;
    blockTimestamp?: number;
    txHash?: string;
}

const TableRowComponent = ({
    isBuy,
    isHyped,
    progress,
    price,
    amountIn,
    amountOut,
    sender,
    blockTimestamp,
}: TableRowProps) => {
    const displayPrice = price ? formatPrice(price) : '---';
    const displayAmt = amountOut ? formatVolume(amountOut) : '---';
    const displayTotal = amountIn ? formatVolume(amountIn) : '---';
    const displayAge = blockTimestamp ? timeAgo(blockTimestamp) : '---';
    const displayMaker = sender ? formatAddress(sender, 4) : '---';
    // MCap estimate: price_human × 1e9 (total supply assumption)
    const priceNum = price ? fromWad(price) : 0;
    const mcapEst = priceNum > 0 ? `$${safeFixed(priceNum * 1e9 / 1000, 1)}K` : '---';

    return (
        <tr className={`h-8
            ${isBuy ? "text-green-table" : "text-red-middle"}
        `}>
            <td className="px-3 py-1.5 whitespace-nowrap">{displayAge}</td>
            <td className="px-3 py-1.5 whitespace-nowrap">
                <span className={`text-size-10 px-1.5 py-0.5 rounded-sm font-manrope-bold
                    ${isBuy ? "bg-green-opacity-3" : "bg-red-opacity-3"} 
                `}>
                    {isBuy ? "Buy" : "Sell"} 
                </span>
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap">{displayPrice}</td>
            <td className="px-3 py-1.5 whitespace-nowrap text-dark-disabled">{mcapEst}</td>
            <td className="px-3 py-1.5 whitespace-nowrap">
                <div className="flex items-center gap-2 relative">
                    <span>{displayAmt}</span>
                    <div className={`bg-linear-to-r h-8 absolute left-12
                       ${isBuy ? 'from-green-opacity-002 to-green-opacity-015' : 'from-red-opacity-002 to-red-opacity-015'}  
                    `} style={{width: `${progress}%`}}></div>
                </div>
            </td>
            <td className="px-3 py-1.5 whitespace-nowrap">{displayTotal}</td>
            <td className="px-3 py-1.5 whitespace-nowrap">
                <div className="flex justify-end items-center gap-1.5">
                    <span className={`${isHyped ? "text-yellow-table" : ""}`}>
                        {displayMaker}
                    </span>
                    <Image src={dockerImg} alt="maker" className="min-w-3" />
                </div>
            </td>
        </tr>
    );
};
  
export default TableRowComponent;