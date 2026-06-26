import { formatPercent } from '@/utils/format';

interface PriceChangeProps {
  value: number;
  className?: string;
}

export default function PriceChange({ value, className = '' }: PriceChangeProps) {
  const isPositive = value >= 0;
  return (
    <span className={`font-manrope-bold ${isPositive ? 'text-green-middle' : 'text-red-middle'} ${className}`}>
      {formatPercent(value)}
    </span>
  );
}
