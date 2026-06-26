'use client';

import { type ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import SidebarNav from './sidebar-nav';
import WalletButton from './wallet-button';
import GlobalSearch from './global-search';
import MobileBottomNav from './mobile-bottom-nav';
import { PlatformMetricsMobile } from './platform-metrics';
import { useSidebarState } from '@/hooks/ui/use-sidebar-state';
import SiteFooter from '@/ui/shared/site-footer';
import { SquiCircleFilterStatic } from '@/new-components/SkiperSquiCircleFilterLayout';
import { useWalletToasts } from '@/hooks/ui/use-wallet-toasts';

export default function AppShell({ children }: { children: ReactNode }) {
  const { expanded: sidebarExpanded } = useSidebarState();
  const [mounted, setMounted] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useWalletToasts();
  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      <SquiCircleFilterStatic />
      <SidebarNav />
      <div
        className={`min-h-screen flex flex-col transition-all duration-200 overflow-x-hidden ${
          mounted ? (sidebarExpanded ? 'sm:ml-56' : 'sm:ml-[60px]') : 'sm:ml-56'
        }`}
      >
        {/* ── Desktop header ───────────────────────────────────── */}
        <header
          className={`fixed top-0 right-0 z-40 bg-black-gray/95 backdrop-blur-sm border-b border-dark-gray px-4 py-2.5 hidden sm:flex items-center gap-3 ${
            mounted ? (sidebarExpanded ? 'sm:left-56' : 'sm:left-[60px]') : 'sm:left-56'
          }`}
        >
          <div className="flex-1 max-w-md">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <Link
              href="/create"
              className="flex items-center gap-1.5 border border-dark-gray rounded-lg px-3.5 py-1.5 bg-dark-gray2 hover:bg-dark-gray transition text-size-12"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-half-enabled">
                <path d="M7 1.75V12.25M1.75 7H12.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="font-manrope-bold text-half-enabled">Create</span>
            </Link>
            <WalletButton />
          </div>
        </header>

        {/* ── Mobile header ────────────────────────────────────── */}
        <header className="fixed top-0 left-0 right-0 z-40 bg-black-gray/95 backdrop-blur-sm border-b border-dark-gray px-3 py-2 flex sm:hidden items-center gap-2">
          <Link href="/" className="flex items-center flex-shrink-0">
            <Image src="/sidiora_fun_logo_offwhite.png" alt="Sidiora" width={110} height={28} className="h-7 w-auto" />
          </Link>
          <div className="flex-1" />
          <button
            onClick={() => setMobileSearchOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-dark-gray bg-dark-gray2 hover:bg-dark-gray transition"
            title="Search"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-half-enabled">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <Link
            href="/create"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-dark-gray bg-dark-gray2 hover:bg-dark-gray transition"
            title="Create"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-half-enabled">
              <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </Link>
          <WalletButton />
        </header>

        {/* Mobile search overlay */}
        {mobileSearchOpen && (
          <div className="fixed inset-0 z-50 bg-black-gray/98 flex flex-col sm:hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-gray">
              <div className="flex-1">
                <GlobalSearch />
              </div>
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-dark-gray text-half-enabled hover:text-white transition flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 pb-20 sm:pb-0 overflow-x-hidden pt-[52px] sm:pt-[64px]">
          <PlatformMetricsMobile />
          {children}
          <SiteFooter />
        </main>
      </div>
      <MobileBottomNav />
    </>
  );
}
