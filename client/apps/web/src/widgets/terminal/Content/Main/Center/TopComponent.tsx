'use client';

import { useCallback } from 'react';
import Image from "next/image";

import copyImg from "@/assets/icons/copy.svg";
import shareImg from "@/assets/icons/share.svg";
import worldImg from "@/assets/icons/world.svg";
import searchImg from "@/assets/icons/search-alt_svgrepo_small.com.svg";
import xImg from "@/assets/icons/X.svg";
import exclamationImg from "@/assets/icons/exclamation2.svg";
import NormalButton from "@/ui/atoms/NormalButton";

import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatPrice, formatVolume, formatAddress, safeFixed } from "@/utils/format";

function timeAgo(ts: number): string {
    if (!ts) return '';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
}

const ChartTopComponent = () => {
    const stats = useTerminalStore((s) => s.stats);
    const metadata = useTerminalStore((s) => s.metadata);
    const holderCount = useTerminalStore((s) => s.holderCount);

    const tokenAddr = stats?.tokenAddress || '';
    const name = metadata?.name || metadata?.symbol || (tokenAddr ? formatAddress(tokenAddr, 4) : '---');
    const symbol = metadata?.symbol || '';
    const logoSrc = metadata?.images?.logo;
    const age = stats?.createdAt ? timeAgo(stats.createdAt) : '';

    const handleCopy = useCallback(() => {
        if (tokenAddr) navigator.clipboard.writeText(tokenAddr);
    }, [tokenAddr]);

    const fmtChange = (val: string | undefined) => {
        if (!val) return { text: '---', cls: 'text-dark-disabled' };
        const n = Number(val) / 100;
        const cls = n > 0 ? 'text-green-from' : n < 0 ? 'text-red-middle' : 'text-dark-disabled';
        return { text: `${n >= 0 ? '+' : ''}${safeFixed(n, 2)}%`, cls };
    };

    const c5m = fmtChange(stats?.priceChange5m);
    const c1h = fmtChange(stats?.priceChange1h);
    const c24h = fmtChange(stats?.priceChange24h);

    return (
      <div className="bg-black-gray px-2.5 py-1.5 text-size-11 border-b border-dark-gray/50">
        <div className="flex items-center gap-3 overflow-x-auto">
            {/* Token pair name */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-6 h-6 rounded-full bg-dark-gray flex-shrink-0 overflow-hidden">
                    <img src={logoSrc || '/shadcn.png'} alt="" className="w-full h-full object-cover" />
                </div>
                <span className="text-white text-size-13 font-manrope-bold">{symbol || name}</span>
                {symbol && name !== symbol && <span className="text-dark-disabled text-size-10">{name}</span>}
                {age && <span className="text-green-middle3 text-size-9">{age}</span>}
                <button onClick={handleCopy} className="hover:opacity-80 transition flex-shrink-0">
                    <NormalButton prefixIcon={copyImg} border="border-none" size="w-4 h-4" padding="p-0"/>
                </button>
                <NormalButton prefixIcon={shareImg} border="border-none" size="w-4 h-4" padding="p-0"/>
            </div>

            <div className="border-l border-dark-gray h-5 flex-shrink-0" />

            {/* Inline stats — like padre.gg top bar */}
            <div className="flex items-center gap-3 flex-shrink-0 text-size-10">
                <div className="flex flex-col items-center">
                    <span className="text-dark-disabled text-size-8">Price</span>
                    <span className="text-white font-manrope-bold">{stats ? formatPrice(stats.price) : '---'}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-dark-disabled text-size-8">Mkt Cap</span>
                    <span className="text-cyan-middle font-manrope-bold">{stats ? formatVolume(stats.marketCap) : '---'}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-dark-disabled text-size-8">Vol 24h</span>
                    <span className="text-white font-manrope-bold">{stats ? formatVolume(stats.volume24h) : '---'}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-dark-disabled text-size-8">Holders</span>
                    <span className="text-white font-manrope-bold">{holderCount > 0 ? holderCount.toLocaleString() : '---'}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-dark-disabled text-size-8">5m</span>
                    <span className={`font-manrope-bold ${c5m.cls}`}>{c5m.text}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-dark-disabled text-size-8">1h</span>
                    <span className={`font-manrope-bold ${c1h.cls}`}>{c1h.text}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-dark-disabled text-size-8">24h</span>
                    <span className={`font-manrope-bold ${c24h.cls}`}>{c24h.text}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-dark-disabled text-size-8">Risk</span>
                    <span className={`font-manrope-bold ${
                        !stats ? 'text-dark-disabled' :
                        stats.riskRating <= 30 ? 'text-green-middle' :
                        stats.riskRating <= 60 ? 'text-yellow-middle' : 'text-red-middle'
                    }`}>
                        {!stats ? '---' : `${stats.riskRating}`}
                    </span>
                </div>
            </div>
        </div>
      </div>
    );
  };
  
  export default ChartTopComponent;