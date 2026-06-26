'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavTab {
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
}

const tabs: NavTab[] = [
  {
    href: '/',
    label: 'Home',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#8BFFC5' : '#5F6577'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: '/live',
    label: 'Live',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#8BFFC5' : '#5F6577'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="2"/>
        <path d="M16.24 7.76a6 6 0 010 8.49"/>
        <path d="M7.76 16.24a6 6 0 010-8.49"/>
        <path d="M19.07 4.93a10 10 0 010 14.14"/>
        <path d="M4.93 19.07a10 10 0 010-14.14"/>
      </svg>
    ),
  },
  {
    href: '/meta-ag/swap',
    label: 'Swap',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#8BFFC5' : '#5F6577'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 10L3 14L7 18"/>
        <path d="M3 14H21"/>
        <path d="M17 6L21 10L17 14"/>
        <path d="M21 10H3"/>
      </svg>
    ),
  },
  {
    href: '/meta-ag/orders',
    label: 'Orders',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#8BFFC5' : '#5F6577'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18"/>
        <path d="M3 15h18"/>
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? '#8BFFC5' : '#5F6577'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black-gray/95 backdrop-blur-md border-t border-dark-gray/80 sm:hidden shadow-[0_-4px_24px_rgba(0,0,0,0.5)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full"
            >
              {tab.icon(active)}
              <span className={`text-[9px] font-manrope-bold leading-none ${
                active ? 'text-green-middle' : 'text-dark-disabled'
              }`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
