'use client';

import { cn } from '@/lib/utils';

function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={style}
      className={cn(
        'relative overflow-hidden rounded-lg bg-dark-gray/50',
        'before:absolute before:inset-0',
        'before:animate-[shimmer_2s_ease-in-out_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-white/[0.03] before:to-transparent',
        'before:-translate-x-full',
        className,
      )}
    />
  );
}

export function TokenCardSkeleton() {
  return (
    <div className="rounded-xl bg-black-gray2 overflow-hidden flex flex-col">
      <Shimmer className="aspect-square w-full rounded-none" />
      <div className="p-2.5 flex flex-col gap-1.5">
        <Shimmer className="h-3 w-24 rounded" />
        <div className="flex items-center justify-between">
          <Shimmer className="h-3 w-16 rounded" />
          <Shimmer className="h-3 w-10 rounded" />
        </div>
        <Shimmer className="h-2 w-20 rounded" />
      </div>
    </div>
  );
}

export function TokenGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-4">
      {Array.from({ length: count }).map((_, i) => (
        <TokenCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 pt-8 space-y-6">
      <div className="flex items-center gap-4">
        <Shimmer className="w-20 h-20 rounded-full" />
        <div className="space-y-2 flex-1">
          <Shimmer className="h-5 w-40 rounded" />
          <Shimmer className="h-3 w-28 rounded" />
          <Shimmer className="h-3 w-64 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Shimmer className="h-20 rounded-xl" />
        <Shimmer className="h-20 rounded-xl" />
        <Shimmer className="h-20 rounded-xl" />
      </div>
      <Shimmer className="h-[200px] rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function TerminalSkeleton() {
  return (
    <div className="flex h-full gap-1 p-1">
      <div className="w-[240px] flex-shrink-0 space-y-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <Shimmer key={i} className="h-10 rounded-lg" />
        ))}
      </div>
      <div className="flex-1 space-y-1">
        <Shimmer className="h-10 rounded-lg" />
        <Shimmer className="h-[400px] rounded-lg" />
        <Shimmer className="h-[200px] rounded-lg" />
      </div>
      <div className="w-[300px] flex-shrink-0 space-y-1">
        <Shimmer className="h-[200px] rounded-lg" />
        <Shimmer className="h-[120px] rounded-lg" />
        <Shimmer className="h-[200px] rounded-lg" />
      </div>
    </div>
  );
}

export function SearchResultSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-dark-gray/30 last:border-0">
          <Shimmer className="w-8 h-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-3 w-24 rounded" />
            <Shimmer className="h-2 w-16 rounded" />
          </div>
          <Shimmer className="h-3 w-12 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-dark-gray/20 border border-dark-gray/30 p-4">
      <div className="flex items-end gap-1 h-[180px]">
        {[45,72,38,85,55,68,42,90,60,35,75,50,82,40,65,48,78,55,88,43,70,58,80,52].map((h, i) => (
          <Shimmer
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <Shimmer className="h-2 w-8 rounded" />
        <Shimmer className="h-2 w-8 rounded" />
        <Shimmer className="h-2 w-8 rounded" />
        <Shimmer className="h-2 w-8 rounded" />
      </div>
    </div>
  );
}

export { Shimmer };
