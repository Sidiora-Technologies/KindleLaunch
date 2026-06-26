'use client';

import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualListProps<T> {
  items: T[];
  estimateSize?: number;
  renderItem: (item: T, index: number) => ReactNode;
  maxHeight?: number;
  emptyMessage?: string;
  className?: string;
}

export function VirtualList<T>({
  items,
  estimateSize = 40,
  renderItem,
  maxHeight = 500,
  emptyMessage = 'No items',
  className,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 10,
  });

  if (items.length === 0) {
    return (
      <div className="p-4 text-center text-dark-disabled text-size-11">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto ${className ?? ''}`}
      style={{ maxHeight }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
          >
            {renderItem(items[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
