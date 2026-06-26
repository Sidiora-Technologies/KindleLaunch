"use client";

import React, { useState, useEffect } from "react";

import TickerBar from "./TickerBar";
import CenterComponent from "./Center";
import LeftComponent from "./Left";
import RightComponent from "./Right";

const Main = () => {
  const [showLeft, setShowLeft] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="w-full text-white overflow-x-hidden">
      <TickerBar />

      <div className="p-1.5 sm:px-2 sm:pt-2 w-full">
        {/* Mobile: toggle button for token list */}
        <div className="lg:hidden mb-1.5">
          <button
            onClick={() => setShowLeft(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-gray text-size-11 font-manrope-bold text-half-enabled hover:bg-dark-gray/30 transition w-full justify-center"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
            {showLeft ? 'Hide Tokens' : 'Show Tokens'}
          </button>
        </div>

        {/* Mobile: collapsible token list */}
        {showLeft && (
          <div className="lg:hidden mb-2 max-h-[50vh] overflow-y-auto rounded-lg border border-dark-gray">
            <LeftComponent />
          </div>
        )}

        <div className="flex gap-1.5 w-full">
          {/* Left panel — narrower like padre.gg */}
          <div className="hidden lg:block w-[240px] flex-shrink-0">
            <div className="sticky top-0 max-h-[calc(100vh-36px)] overflow-y-auto">
              <LeftComponent />
            </div>
          </div>

          {/* Center: chart + table — takes all remaining space */}
          <div className="flex-1 min-w-0">
            <CenterComponent />
          </div>

          {/* Right panel — narrower like padre.gg */}
          <div className="hidden xl:block w-[280px] flex-shrink-0">
            <div className="sticky top-0 max-h-[calc(100vh-36px)] overflow-y-auto">
              <RightComponent />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Main;