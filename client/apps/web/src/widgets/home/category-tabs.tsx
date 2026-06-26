'use client';

const CATEGORIES = [
  { key: 'breakout', label: 'Movers', dot: 'bg-green-middle', tone: 'bg-green-middle/15 border-green-middle/30' },
  { key: 'new', label: 'New', dot: 'bg-cyan-middle', tone: 'bg-cyan-middle/15 border-cyan-middle/30' },
  { key: 'top_volume', label: 'Market cap', dot: 'bg-yellow-middle', tone: 'bg-yellow-middle/15 border-yellow-middle/30' },
  { key: 'movers', label: 'Top Gainers', dot: 'bg-red-middle', tone: 'bg-red-middle/15 border-red-middle/30' },
  { key: 'unusual', label: 'Unusual', dot: 'bg-pink-middle', tone: 'bg-pink-middle/15 border-pink-middle/30' },
] as const;

export type RankingCategory = (typeof CATEGORIES)[number]['key'];

interface CategoryTabsProps {
  active: RankingCategory;
  onChange: (category: RankingCategory) => void;
}

export default function CategoryTabs({ active, onChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.key}
          onClick={() => onChange(cat.key)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-size-11 font-manrope-bold whitespace-nowrap transition border ${
            active === cat.key
              ? `${cat.tone} text-white`
              : 'text-dark-disabled hover:text-half-enabled border-dark-gray/50 bg-dark-gray2/40'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${cat.dot}`} />
          {cat.label}
        </button>
      ))}
    </div>
  );
}
