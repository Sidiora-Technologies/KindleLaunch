'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, safeFixed } from '@/utils/format';

interface NetWorthChartProps {
  dataPoints: { timestamp: number; value: number }[];
  currentValue: number;
}

const TIMEFRAMES = ['24H', '7D', '30D', 'ALL'] as const;
type Timeframe = typeof TIMEFRAMES[number];

function filterByTimeframe(data: { timestamp: number; value: number }[], tf: Timeframe) {
  if (tf === 'ALL' || data.length === 0) return data;
  const now = Date.now();
  const cutoff = tf === '24H' ? now - 86400_000 : tf === '7D' ? now - 604800_000 : now - 2592000_000;
  return data.filter((d) => d.timestamp >= cutoff);
}

export default function NetWorthChart({ dataPoints, currentValue }: NetWorthChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('7D');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const filtered = useMemo(() => filterByTimeframe(dataPoints, timeframe), [dataPoints, timeframe]);

  const { path, areaPath, min, max, change, changePercent } = useMemo(() => {
    if (filtered.length < 2) return { path: '', areaPath: '', min: 0, max: 0, change: 0, changePercent: 0 };

    const values = filtered.map((d) => d.value);
    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const range = mx - mn || 1;
    const w = 400;
    const h = 120;
    const step = w / (filtered.length - 1);

    const points = filtered.map((d, i) => ({
      x: i * step,
      y: h - ((d.value - mn) / range) * (h - 8) - 4,
    }));

    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }

    const area = `${d} L${w},${h} L0,${h} Z`;
    const firstVal = filtered[0].value;
    const lastVal = filtered[filtered.length - 1].value;
    const ch = lastVal - firstVal;
    const pct = firstVal > 0 ? (ch / firstVal) * 100 : 0;

    return { path: d, areaPath: area, min: mn, max: mx, change: ch, changePercent: pct };
  }, [filtered]);

  const displayValue = hoveredIdx !== null && filtered[hoveredIdx]
    ? filtered[hoveredIdx].value
    : currentValue;

  const isPositive = change >= 0;
  const lineColor = isPositive ? '#34d399' : '#f87171';

  if (filtered.length < 2) {
    return (
      <div className="rounded-xl border border-dark-gray/40 bg-gradient-to-b from-dark-gray2/20 to-transparent p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-size-10 text-dark-disabled font-manrope-bold uppercase tracking-wider">Portfolio Value</span>
            <div className="text-size-20 font-manrope-bold text-white mt-0.5">{formatCurrency(currentValue)}</div>
          </div>
        </div>
        <div className="flex items-center justify-center h-[120px] text-size-11 text-dark-disabled">
          Not enough data to display chart
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dark-gray/40 bg-gradient-to-b from-dark-gray2/20 to-transparent p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-size-10 text-dark-disabled font-manrope-bold uppercase tracking-wider">Portfolio Value</span>
          <div className="text-size-20 font-manrope-bold text-white mt-0.5">{formatCurrency(displayValue)}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-size-11 font-manrope-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{formatCurrency(Math.abs(change))}
            </span>
            <span className={`text-size-10 ${isPositive ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
              ({isPositive ? '+' : ''}{safeFixed(changePercent, 2)}%)
            </span>
          </div>
        </div>

        <div className="flex gap-0.5 bg-dark-gray2/50 rounded-lg p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded-md text-size-10 font-manrope-bold transition-all ${
                timeframe === tf
                  ? 'bg-dark-gray text-white'
                  : 'text-dark-disabled hover:text-half-enabled'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div
        className="relative"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <svg
          viewBox="0 0 400 120"
          className="w-full h-[120px]"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="networth-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.12" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d={areaPath}
            fill="url(#networth-fill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
          <motion.path
            d={path}
            fill="none"
            stroke={lineColor}
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>

        {/* Hover overlay */}
        <div className="absolute inset-0 flex">
          {filtered.map((_, i) => (
            <div
              key={i}
              className="flex-1 cursor-crosshair"
              onMouseEnter={() => setHoveredIdx(i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
