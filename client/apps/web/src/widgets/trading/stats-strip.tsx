'use client';

import { formatCurrency, formatPrice, from6dec, safeFixed } from '@/utils/format';
import { useTokenStats } from '@/hooks/market/use-token-stats';

interface StatsStripProps {
  poolAddress: string;
}

function bpsToPercent(bps: string | undefined): number {
  if (!bps) return 0;
  return Number(bps) / 100;
}

function fmtChange(v: number): string {
  return `${v >= 0 ? '+' : ''}${safeFixed(v, 2)}%`;
}

function changeColor(v: number): string {
  return v >= 0 ? 'text-green-middle' : 'text-red-middle';
}

export default function StatsStrip({ poolAddress }: StatsStripProps) {
  const { data: stats } = useTokenStats(poolAddress);

  if (!stats) return null;

  const change24h = bpsToPercent(stats.priceChange24h);
  const vol24h = from6dec(stats.volume24h);
  const vol1h = from6dec(stats.volume1h);

  const dollarChange = (raw: string | undefined): number => {
    if (!raw) return 0;
    return Number(raw) / 1e6;
  };

  const changes = [
    { label: '1m', val: bpsToPercent(stats.priceChange1m), dollar: dollarChange(stats.priceChangeDollar1m) },
    { label: '5m', val: bpsToPercent(stats.priceChange5m), dollar: dollarChange(stats.priceChangeDollar5m) },
    { label: '15m', val: bpsToPercent(stats.priceChange15m), dollar: dollarChange(stats.priceChangeDollar15m) },
    { label: '1h', val: bpsToPercent(stats.priceChange1h), dollar: dollarChange(stats.priceChangeDollar1h) },
    { label: '24h', val: change24h, dollar: dollarChange(stats.priceChangeDollar24h) },
  ];
  const changeByLabel: Record<string, { val: number; dollar: number }> = Object.fromEntries(
    changes.map((item) => [item.label, { val: item.val, dollar: item.dollar }]),
  );

  const priceCards = [
    { label: '1m', ...changeByLabel['1m'] },
    { label: '5m', ...changeByLabel['5m'] },
    { label: '1h', ...changeByLabel['1h'] },
    { label: '24h', ...changeByLabel['24h'] },
  ];

  const totalTxs = (stats.buyCount24h ?? 0) + (stats.sellCount24h ?? 0);
  const buyRatio = totalTxs > 0 ? ((stats.buyCount24h ?? 0) / totalTxs) * 100 : 50;

  return (
    <div className="w-full max-w-full overflow-hidden space-y-2">
      {/* Row 1: Vol + Price + change cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <div className="rounded-xl border border-dark-gray bg-black-gray2 px-3 py-2.5 min-h-[56px] flex flex-col justify-center">
          <div className="text-size-9 text-dark-disabled leading-none">Vol 24h</div>
          <div className="text-size-12 font-manrope-bold leading-none mt-1 text-white">{formatCurrency(vol24h)}</div>
          <div className="text-size-9 text-dark-disabled/70 leading-none mt-0.5">1h: {formatCurrency(vol1h)}</div>
        </div>
        <div className="rounded-xl border border-dark-gray bg-black-gray2 px-3 py-2.5 min-h-[56px] flex flex-col justify-center">
          <div className="text-size-9 text-dark-disabled leading-none">Price</div>
          <div className="text-size-12 font-manrope-bold leading-none mt-1 text-white">{formatPrice(stats.price)}</div>
        </div>
        {priceCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-dark-gray bg-black-gray2 px-3 py-2.5 min-h-[56px] flex flex-col justify-center"
          >
            <div className="text-size-9 text-dark-disabled leading-none">{card.label}</div>
            <div className={`text-size-12 font-manrope-bold leading-none mt-1 ${changeColor(card.val)}`}>
              {fmtChange(card.val)}
            </div>
            {card.dollar !== 0 && (
              <div className={`text-size-9 leading-none mt-0.5 ${changeColor(card.dollar)}`}>
                {card.dollar >= 0 ? '+' : ''}{formatCurrency(Math.abs(card.dollar))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Row 2: 24h trade activity */}
      {totalTxs > 0 && (
        <div className="rounded-xl border border-dark-gray bg-black-gray2 px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-size-9 text-dark-disabled">24h Trade Activity</span>
            <span className="text-size-9 text-dark-disabled">
              {totalTxs} txs
              {(stats.uniqueTraders24h ?? 0) > 0 && (
                <> · <span className="text-half-enabled">{stats.uniqueTraders24h} traders</span></>
              )}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-dark-gray">
            <div
              className="h-full bg-green-middle rounded-l-full transition-all duration-500"
              style={{ width: `${buyRatio}%` }}
            />
            <div
              className="h-full bg-red-middle rounded-r-full transition-all duration-500"
              style={{ width: `${100 - buyRatio}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-size-9 text-green-middle font-manrope-bold">
              {stats.buyCount24h ?? 0} buys ({safeFixed(buyRatio, 0)}%)
            </span>
            <span className="text-size-9 text-red-middle font-manrope-bold">
              {stats.sellCount24h ?? 0} sells ({safeFixed(100 - buyRatio, 0)}%)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
