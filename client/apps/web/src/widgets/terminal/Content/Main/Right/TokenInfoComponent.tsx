'use client';

import { useTerminalStore } from "@/utils/stores/terminalStore";
import { formatAddress, formatVolume, formatPrice } from "@/utils/format";

function timeAgo(ts: number): string {
    if (!ts) return '---';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

const TokenInfoComponent = () => {
    const stats = useTerminalStore((s) => s.stats);
    const metadata = useTerminalStore((s) => s.metadata);

    const creator = metadata?.creator;
    const description = metadata?.description;
    const socials = metadata as any;
    const tokenAddr = stats?.tokenAddress || '';
    const poolAddr = stats?.poolAddress || '';

    return (
        <div className="rounded-md border-dark-gray border-1 bg-gradient-black-gray overflow-hidden">
            <div className="px-3 py-2 border-b border-dark-gray">
                <span className="text-size-12 font-manrope-bold text-white">Token Info</span>
            </div>

            <div className="p-3 space-y-2 text-size-10">
                {/* Description */}
                {description && (
                    <p className="text-half-enabled text-size-11 leading-snug line-clamp-3">{description}</p>
                )}

                {/* Socials */}
                {(socials?.socials?.twitter || socials?.socials?.website || socials?.socials?.telegram) && (
                    <div className="flex items-center gap-3 flex-wrap">
                        {socials.socials.twitter && (
                            <a href={socials.socials.twitter.startsWith('http') ? socials.socials.twitter : `https://x.com/${socials.socials.twitter}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-half-enabled hover:text-white transition">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                <span>X</span>
                            </a>
                        )}
                        {socials.socials.website && (
                            <a href={socials.socials.website.startsWith('http') ? socials.socials.website : `https://${socials.socials.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-half-enabled hover:text-white transition">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                                <span>Web</span>
                            </a>
                        )}
                        {socials.socials.telegram && (
                            <a href={socials.socials.telegram.startsWith('http') ? socials.socials.telegram : `https://t.me/${socials.socials.telegram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-half-enabled hover:text-white transition">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                                <span>TG</span>
                            </a>
                        )}
                    </div>
                )}

                {/* Key stats grid */}
                <div className="grid grid-cols-2 gap-1.5 text-dark-disabled">
                    <div className="flex justify-between border border-dark-gray rounded px-2 py-1 bg-dark-gray/10">
                        <span>Creator</span>
                        <a
                            href={creator ? `/profile/${creator}` : '#'}
                            className="text-half-enabled hover:text-pink-middle transition"
                        >
                            {creator ? formatAddress(creator, 3) : '---'}
                        </a>
                    </div>
                    <div className="flex justify-between border border-dark-gray rounded px-2 py-1 bg-dark-gray/10">
                        <span>Age</span>
                        <span className="text-white">{stats?.createdAt ? timeAgo(stats.createdAt) : '---'}</span>
                    </div>
                    <div className="flex justify-between border border-dark-gray rounded px-2 py-1 bg-dark-gray/10">
                        <span>Token</span>
                        <a
                            href={tokenAddr ? `https://paxscan.paxeer.app/address/${tokenAddr}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-half-enabled hover:text-pink-middle transition"
                        >
                            {tokenAddr ? formatAddress(tokenAddr, 3) : '---'}
                        </a>
                    </div>
                    <div className="flex justify-between border border-dark-gray rounded px-2 py-1 bg-dark-gray/10">
                        <span>Pool</span>
                        <a
                            href={poolAddr ? `https://paxscan.paxeer.app/address/${poolAddr}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-half-enabled hover:text-pink-middle transition"
                        >
                            {poolAddr ? formatAddress(poolAddr, 3) : '---'}
                        </a>
                    </div>
                    <div className="flex justify-between border border-dark-gray rounded px-2 py-1 bg-dark-gray/10">
                        <span>Price</span>
                        <span className="text-white">{stats ? formatPrice(stats.price) : '---'}</span>
                    </div>
                    <div className="flex justify-between border border-dark-gray rounded px-2 py-1 bg-dark-gray/10">
                        <span>Mkt Cap</span>
                        <span className="text-white">{stats ? formatVolume(stats.marketCap) : '---'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
  
export default TokenInfoComponent;