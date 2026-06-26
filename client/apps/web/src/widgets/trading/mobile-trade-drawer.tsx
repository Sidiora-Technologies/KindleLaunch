'use client';

import { useState, useEffect } from 'react';
import TradePanel from './trade-panel';

interface MobileTradeDrawerProps {
  poolAddress: string;
}

export default function MobileTradeDrawer({ poolAddress }: MobileTradeDrawerProps) {
  const [open, setOpen] = useState(false);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Fixed bottom Buy button — mobile only */}
      <div className="fixed bottom-[72px] left-0 right-0 z-40 px-4 xl:hidden" style={{ paddingBottom: 'calc(4px + env(safe-area-inset-bottom, 0px))' }}>
        <button
          onClick={() => setOpen(true)}
          className="w-full py-4 rounded-2xl bg-green-middle text-black text-size-16 font-manrope-extra-bold shadow-lg shadow-green-middle/25 active:scale-[0.97] transition-transform"
        >
          Buy
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm xl:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer — slides up from bottom */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 xl:hidden transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="bg-[#0d1117] rounded-t-2xl max-h-[85vh] overflow-y-auto" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
          {/* Close handle */}
          <div className="flex items-center justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-dark-gray" />
          </div>

          {/* Close X button */}
          <div className="flex justify-end px-4 pb-1">
            <button
              onClick={() => setOpen(false)}
              className="text-dark-disabled hover:text-white transition p-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Trade panel content */}
          <div className="px-2">
            <TradePanel poolAddress={poolAddress} />
          </div>
        </div>
      </div>
    </>
  );
}
