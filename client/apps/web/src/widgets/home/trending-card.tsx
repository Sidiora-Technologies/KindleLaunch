'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import TokenImage from '@/ui/shared/token-image';
import { formatCurrency, from6dec } from '@/utils/format';
import { AppleBorderGradient } from '@/new-components/AppleBorderGradient';
import type { TrendingCard as TrendingCardData } from './use-trending-strip';

interface TrendingCardProps {
  card: TrendingCardData;
  isLit: boolean;
  flashKey: number;
}

/**
 * Single trending strip card — pure UI. Layout animation is preserved
 * via framer-motion's `layout` prop so the buy-reorder swap is animated.
 */
export default function TrendingCard({ card, isLit, flashKey }: TrendingCardProps) {
  const [hovered, setHovered] = useState(false);
  const logoUrl = card.meta?.images?.logo;
  const bannerUrl = card.meta?.images?.banner;
  const mcap = from6dec(card.marketCap);
  const name = card.meta?.name || card.meta?.symbol || card.poolAddress.slice(0, 8);
  const symbol = card.meta?.symbol || '';
  const desc = card.meta?.description
    ? (card.meta.description.length > 60 ? card.meta.description.slice(0, 57) + '...' : card.meta.description)
    : '';

  return (
    <motion.div
      key={card.poolAddress}
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 38 }}
      className="min-w-[220px] max-w-[220px] flex-shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        href={`/token/${card.poolAddress}`}
        className={`block rounded-xl overflow-hidden border bg-black-gray2 hover:border-dark-gray6 transition-colors relative ${
          isLit ? 'trending-buy-flash' : 'border-dark-gray'
        }`}
      >
        <AppleBorderGradient
          preview={hovered || isLit}
          intensity="lg"
          className="rounded-xl"
        />
        <div key={flashKey}>
          <div className="relative h-[116px] bg-dark-gray overflow-hidden">
            <TokenImage
              fill
              src={bannerUrl || logoUrl}
              alt={symbol || name}
              sizes="220px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
            <div className="absolute bottom-2 left-2">
              <span className="font-manrope-extra-bold text-size-13 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                {formatCurrency(mcap)}
              </span>
            </div>
            <AnimatePresence>
              {isLit && (
                <motion.div
                  key="buy-badge"
                  initial={{ opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.75 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-2 right-2"
                >
                  <span className="text-size-8 px-1.5 py-0.5 rounded font-manrope-bold bg-green-middle/20 text-green-middle border border-green-middle/30">
                    BUY
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="p-2.5 border-t border-dark-gray/50 min-h-[54px]">
            <div className="flex items-center gap-1.5">
              <span className="text-size-12 font-manrope-bold text-white truncate">{symbol || name}</span>
              {symbol && name !== symbol && (
                <span className="text-size-10 text-dark-disabled truncate">{name}</span>
              )}
            </div>
            {desc && (
              <p className="text-size-9 text-dark-disabled mt-0.5 leading-tight line-clamp-2">{desc}</p>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
