'use client';

import { useQuery } from '@tanstack/react-query';
import { sdkBaseUrls } from '@/core/sdk-config';
import { queryKeys } from '@/core/query-keys';

type RiskLevel = 'low' | 'medium' | 'high';

interface RiskDetail {
  poolAddress: string;
  riskRating: number;
  riskLevel: RiskLevel;
  riskFactors: string[];
  details: {
    holderCount?: number;
    top10ConcentrationPct?: string;
    creatorHoldingsPct?: string;
    creatorAddress?: string | null;
    hasCreatorSold?: boolean;
    isNew?: boolean;
    ageSeconds?: number | null;
  };
}

const FACTOR_LABELS: Record<string, { label: string; tone: string }> = {
  new:                    { label: 'New pool',            tone: 'bg-yellow-500/15 text-yellow-400' },
  low_holders:            { label: 'Low holders',         tone: 'bg-yellow-500/15 text-yellow-400' },
  high_concentration:     { label: 'High concentration',  tone: 'bg-orange-500/15 text-orange-400' },
  very_high_concentration:{ label: 'Very high conc.',     tone: 'bg-red-500/15 text-red-400' },
  creator_whale:          { label: 'Creator whale',       tone: 'bg-red-500/15 text-red-400' },
  creator_large_holder:   { label: 'Creator large holder',tone: 'bg-orange-500/15 text-orange-400' },
  creator_sold:           { label: 'Creator sold',        tone: 'bg-red-500/20 text-red-400 border border-red-500/30' },
};

const LEVEL_CONFIG: Record<RiskLevel, { label: string; bar: string; text: string }> = {
  low:    { label: 'LOW RISK',    bar: 'bg-green-middle',  text: 'text-green-middle' },
  medium: { label: 'MEDIUM RISK', bar: 'bg-yellow-400',    text: 'text-yellow-400' },
  high:   { label: 'HIGH RISK',   bar: 'bg-red-middle',    text: 'text-red-middle' },
};

interface RiskPanelProps {
  poolAddress: string;
}

export default function RiskPanel({ poolAddress }: RiskPanelProps) {
  const { data: risk } = useQuery<RiskDetail | null>({
    queryKey: queryKeys.tokenRisk(poolAddress),
    queryFn: async () => {
      const res = await fetch(`${sdkBaseUrls.stats}/stats/${poolAddress}/risk`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!poolAddress,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  if (!risk) return null;

  const cfg = LEVEL_CONFIG[risk.riskLevel] ?? LEVEL_CONFIG.medium;
  const barWidth = `${Math.min(100, Math.max(0, risk.riskRating))}%`;

  return (
    <div className="border border-dark-gray rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-gray">
        <span className="text-size-12 font-manrope-bold text-half-enabled">Risk</span>
        <span className={`text-size-10 font-manrope-bold ${cfg.text}`}>{cfg.label}</span>
      </div>

      {/* Score bar */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="flex items-end justify-between mb-1">
          <span className="text-size-9 text-dark-disabled">Score</span>
          <span className={`text-size-14 font-manrope-bold ${cfg.text}`}>{risk.riskRating}<span className="text-size-9 text-dark-disabled font-normal">/100</span></span>
        </div>
        <div className="h-1.5 rounded-full bg-dark-gray overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: barWidth }}
          />
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-px bg-dark-gray border-t border-dark-gray mt-2">
        {risk.details.holderCount !== undefined && (
          <div className="bg-black-gray2 px-3 py-2">
            <div className="text-size-8 text-dark-disabled">Holders</div>
            <div className="text-size-11 font-manrope-bold text-white">{risk.details.holderCount.toLocaleString()}</div>
          </div>
        )}
        {risk.details.top10ConcentrationPct && (
          <div className="bg-black-gray2 px-3 py-2">
            <div className="text-size-8 text-dark-disabled">Top 10</div>
            <div className="text-size-11 font-manrope-bold text-white">{risk.details.top10ConcentrationPct}</div>
          </div>
        )}
        {risk.details.creatorHoldingsPct && (
          <div className="bg-black-gray2 px-3 py-2">
            <div className="text-size-8 text-dark-disabled">Creator holds</div>
            <div className="text-size-11 font-manrope-bold text-white">{risk.details.creatorHoldingsPct}</div>
          </div>
        )}
        {risk.details.ageSeconds !== undefined && risk.details.ageSeconds !== null && (
          <div className="bg-black-gray2 px-3 py-2">
            <div className="text-size-8 text-dark-disabled">Pool age</div>
            <div className="text-size-11 font-manrope-bold text-white">{formatAge(risk.details.ageSeconds)}</div>
          </div>
        )}
      </div>

      {/* Risk factor pills */}
      {risk.riskFactors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2.5 border-t border-dark-gray">
          {risk.riskFactors.map((f) => {
            const meta = FACTOR_LABELS[f] ?? { label: f, tone: 'bg-dark-gray text-dark-disabled' };
            return (
              <span key={f} className={`text-size-8 px-2 py-0.5 rounded-full font-manrope-bold ${meta.tone}`}>
                {meta.label}
              </span>
            );
          })}
        </div>
      )}

      {risk.riskFactors.length === 0 && (
        <div className="px-3 py-2.5 border-t border-dark-gray text-size-9 text-green-middle">
          No active risk factors
        </div>
      )}
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
