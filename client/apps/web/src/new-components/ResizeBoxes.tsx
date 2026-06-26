"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, Ellipsis } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { BiAnchor } from "react-icons/bi";
import { BsFillBookmarkStarFill } from "react-icons/bs";
import { FaCloud } from "react-icons/fa";
import { VscSparkleFilled } from "react-icons/vsc";

const Skiper23 = () => {
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const walletItems = [
    {
      name: "Gxuri",
      amount: "1.03 ETH",
      bgColor: "bg-purple-500",
      icon: VscSparkleFilled,
    },
    {
      name: "Savings",
      amount: "25.08 ETH",
      bgColor: "bg-neutral-900",
      icon: BsFillBookmarkStarFill,
    },
    {
      name: "Staked",
      amount: "0.04 ETH",
      bgColor: "bg-cyan-500",
      icon: FaCloud,
    },
    {
      name: "Spending",
      amount: "0 ETH",
      bgColor: "bg-blue-500",
      icon: BiAnchor,
    },
  ];

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setExpandedCard(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCardClick = (index: number) => {
    setExpandedCard(expandedCard === index ? null : index);
  };

  const renderCard = (item: any, index: number, isBottomRow = false) => {
    const isExpanded = expandedCard === index;
    const hasThreeBottomCards =
      expandedCard !== null && getBottomRowCards().length === 3;

    return (
      <motion.div
        key={index}
        layoutId={`card-${index}`}
        className={`relative flex cursor-pointer flex-col items-start justify-between overflow-hidden p-3 text-white ${
          isExpanded
            ? "h-[180px] w-full"
            : hasThreeBottomCards && isBottomRow
              ? "h-[100px] w-[100px] sm:w-[120px]"
              : "h-[125px] w-[140px] sm:w-[160px]"
        } ${item.bgColor}`}
        style={{
          transformOrigin: "50% 50% 0px",
          transform: "none",
          borderRadius: "24px",
        }}
      >
        <div className="flex w-full items-start justify-between">
          <div className="flex items-center justify-center">
            <motion.div layoutId={`icon-${index}`}>
              <item.icon
                className={`fill-white ${
                  isExpanded
                    ? "h-12 w-12"
                    : hasThreeBottomCards && isBottomRow
                      ? "h-6 w-6"
                      : "h-8 w-8"
                }`}
              />
            </motion.div>
          </div>

          {!isExpanded && (
            <motion.div
              onClick={() => handleCardClick(index)}
              initial={{ opacity: 0, filter: "blur(2px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(2px)" }}
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/20 p-0.5 transition-colors duration-150 ease-out hover:bg-white/30"
            >
              <Ellipsis />
            </motion.div>
          )}

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                layoutId="copy-address"
                className="absolute right-4 top-4 flex items-center justify-center gap-3 font-semibold tracking-tight"
              >
                <p>Copy Address</p>
                <div className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/20 transition-colors duration-150 ease-out hover:bg-white/30">
                  <Copy />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                layoutId="customize"
                className="absolute bottom-4 right-4 flex items-center justify-center gap-3 rounded-full bg-white/20 px-2 py-1 font-semibold tracking-tight"
              >
                Customize
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-col items-start justify-center">
          <motion.span
            layoutId={`title-${index}`}
            className={`font-openrunde select-none font-semibold text-white ${
              isExpanded
                ? "text-xl"
                : hasThreeBottomCards && isBottomRow
                  ? "text-sm"
                  : "text-base"
            }`}
          >
            {item.name}
          </motion.span>
          <motion.span
            layoutId={`desc-${index}`}
            className={`font-openrunde select-none font-semibold text-white/50 ${
              isExpanded
                ? "text-lg"
                : hasThreeBottomCards && isBottomRow
                  ? "text-xs"
                  : "text-sm"
            }`}
          >
            {item.amount}
          </motion.span>
        </div>
      </motion.div>
    );
  };

  const getTopRowCards = () => {
    if (expandedCard === null) {
      return walletItems.slice(0, 2);
    }
    return walletItems.filter((_, index) => index === expandedCard);
  };

  const getBottomRowCards = () => {
    if (expandedCard === null) {
      return walletItems.slice(2, 4);
    }
    return walletItems.filter((_, index) => index !== expandedCard);
  };

  return (
    <div className="font-open-runde flex h-full w-full flex-col items-center justify-center gap-4 p-4">
      <div
        ref={containerRef}
        className="flex h-[300px] w-full max-w-[360px] flex-col justify-end gap-4"
      >
        <div className="flex gap-4">
          {getTopRowCards().map((item, index) => {
            const originalIndex = expandedCard !== null ? expandedCard : index;
            return renderCard(item, originalIndex, false);
          })}
        </div>
        <div className="flex gap-4">
          {getBottomRowCards().map((item, index) => {
            const originalIndex =
              expandedCard !== null
                ? walletItems.findIndex(
                    (_, i) => i !== expandedCard && walletItems[i] === item,
                  )
                : index + 2;
            return renderCard(item, originalIndex, true);
          })}
        </div>
      </div>
    </div>
  );
};

export { Skiper23 };

/**
 * Skiper 23 Micro Interactions_004 — React + framer motion + NumberFlow
 * Orignal concept from family app.
 * Inspired by and adapted from https://jakub.kr
 * We respect the original creators. This is an inspired rebuild with our own taste and does not claim any ownership.
 * These animations aren’t associated with the family.co . They’re independent recreations meant to study interaction design
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Feedback and contributions are welcome.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.in
 * Twitter: https://x.com/Gur__vi
 */
