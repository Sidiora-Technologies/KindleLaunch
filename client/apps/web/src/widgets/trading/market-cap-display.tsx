'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency, formatPrice, from6dec, fromWad, safeFixed } from '@/utils/format';
import { useTokenStats } from '@/hooks/market/use-token-stats';
import { fetchCandleStats, type CandleStats } from '@/core/clients/candle-stats';
import { queryKeys } from '@/core/query-keys';

interface MarketCapDisplayProps {
  poolAddress: string;
}

export default function MarketCapDisplay({ poolAddress }: MarketCapDisplayProps) {
  const { data: statsData } = useTokenStats(poolAddress);

  const mcap = useMemo(() => from6dec(statsData?.marketCap), [statsData?.marketCap]);
  const price = useMemo(() => fromWad(statsData?.price), [statsData?.price]);

  const { data: candle } = useQuery<CandleStats | null>({
    queryKey: queryKeys.candleStats(poolAddress),
    queryFn: () => fetchCandleStats(poolAddress),
    enabled: !!poolAddress,
    staleTime: 60_000,
  });

  const change = Number(candle?.change24h ?? 0);

  const isPositive = change >= 0;
  const ath = candle?.ath ?? 0;
  const atl = candle?.atl ?? 0;
  const athPct = ath > 0 ? Math.min((price / ath) * 100, 100) : 0;
  const drawdown = ath > 0 ? ((price - ath) / ath) * 100 : 0;
  const drawup = atl > 0 ? ((price - atl) / atl) * 100 : 0;

  return (
    <div className="rounded-xl border border-dark-gray bg-black-gray2 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-size-10 text-dark-disabled">Market Cap</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-[32px] font-manrope-extra-bold text-white leading-none">
              {formatCurrency(mcap)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-size-12 font-manrope-bold ${
              isPositive ? 'text-green-middle' : 'text-red-middle'
            }`}>
              {isPositive ? '+' : ''}{formatCurrency(Math.abs(change * mcap / 100))} ({isPositive ? '+' : ''}{safeFixed(change, 2)}%) 24h
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right">
          <div>
            <div className="text-size-9 text-dark-disabled">Price</div>
            <div className="text-size-11 font-manrope-bold text-white">{formatPrice(price)}</div>
          </div>
          <div>
            <div className="text-size-9 text-dark-disabled">ATH</div>
            <div className="text-size-11 font-manrope-bold text-white">{formatPrice(ath)}</div>
          </div>
          <div>
            <div className="text-size-9 text-dark-disabled">from ATH</div>
            <div className={`text-size-10 font-manrope-bold ${drawdown >= 0 ? 'text-green-middle' : 'text-red-middle'}`}>
              {drawdown >= 0 ? '+' : ''}{safeFixed(drawdown, 2)}%
            </div>
          </div>
          <div>
            <div className="text-size-9 text-dark-disabled">from ATL</div>
            <div className={`text-size-10 font-manrope-bold ${drawup >= 0 ? 'text-green-middle' : 'text-red-middle'}`}>
              {drawup >= 0 ? '+' : ''}{safeFixed(drawup, 2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Price + ATH progress bar */}
      {ath > 0 && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-size-8 text-dark-disabled flex-shrink-0">Price vs ATH</span>
          <div className="flex-1 h-[4px] bg-dark-gray rounded-full overflow-hidden">
            <div
              className="h-full bg-green-middle rounded-full transition-all duration-500"
              style={{ width: `${athPct}%` }}
            />
          </div>
          <span className="text-size-8 text-half-enabled flex-shrink-0">
            {safeFixed(athPct, 1)}%
          </span>
        </div>
      )}
    </div>
  );
}
