'use client';

import { useTerminalStore } from '@/utils/stores/terminalStore';
import { formatPrice, formatVolume, formatAddress, safeFixed } from '@/utils/format';

export default function TickerBar() {
  const trendingTokens = useTerminalStore((s) => s.trendingTokens);
  const batchStats = useTerminalStore((s) => s.batchStats);
  const batchMetadata = useTerminalStore((s) => s.batchMetadata);
  const selectPool = useTerminalStore((s) => s.selectPool);

  if (trendingTokens.length === 0) return null;

  const items = trendingTokens.map((item) => {
    const poolStats = batchStats[item.poolAddress] || item.stats;
    const tokenAddr = (poolStats as any)?.tokenAddress || '';
    const meta = tokenAddr ? batchMetadata[tokenAddr] : undefined;
    const symbol = meta?.symbol || formatAddress(item.poolAddress, 3);
    const price = poolStats ? formatPrice((poolStats as any).price) : '---';
    const mcap = poolStats ? formatVolume((poolStats as any).marketCap) : '---';
    const change = poolStats?.priceChange24h ? Number(poolStats.priceChange24h) : 0;
    const isUp = change >= 0;
    return { poolAddress: item.poolAddress, symbol, price, mcap, isUp, change };
  });

  // duplicate for seamless scroll loop
  const doubled = [...items, ...items];

  return (
    <div className="w-full overflow-hidden border-b border-dark-gray bg-dark-gray4/60 h-7 flex items-center">
      <div className="ticker-scroll flex items-center gap-6 whitespace-nowrap">
        {doubled.map((t, i) => (
          <button
            key={`${t.poolAddress}-${i}`}
            onClick={() => selectPool(t.poolAddress)}
            className="flex items-center gap-1.5 text-size-10 hover:text-white transition flex-shrink-0"
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.isUp ? 'bg-green-middle' : 'bg-red-middle'}`} />
            <span className="font-manrope-bold text-half-enabled">{t.symbol}</span>
            <span className="text-white font-manrope-bold">{t.mcap}</span>
            <span className={`font-manrope-bold ${t.isUp ? 'text-green-middle' : 'text-red-middle'}`}>
              {t.isUp ? '+' : ''}{safeFixed(Number(t.change) / 100, 1)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
