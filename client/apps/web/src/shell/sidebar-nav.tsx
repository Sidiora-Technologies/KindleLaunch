'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { PlatformMetricsCompact } from './platform-metrics';
import { useSidebarState } from '@/hooks/ui/use-sidebar-state';

const STORAGE_KEY = 'sidiora-sidebar-expanded';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const mainNav: NavItem[] = [
  { href: '/', label: 'Home', icon: '/icons/layer.svg' },
  { href: '/meta-ag/swap', label: 'Spot Swaps', icon: '/icons/ArrowsLeftRight.svg' },
  { href: '/meta-ag/orders', label: 'Spot', icon: '/icons/graph.svg' },
  { href: '/live', label: 'Live', icon: '/icons/live.svg' },
  { href: '/terminal', label: 'Terminal', icon: '/icons/graph.svg' },
  { href: '/chat', label: 'Chat', icon: '/icons/chat.svg' },
  { href: '/profile', label: 'Profile', icon: '/icons/avatar_dark.svg' },
];

function NavButton({ item, isActive, expanded }: { item: NavItem; isActive: boolean; expanded: boolean }) {
  return (
    <Link
      href={item.href}
      title={expanded ? undefined : item.label}
      className={`flex items-center gap-3 group transition-colors rounded-xl ${
        expanded ? 'px-4 py-3' : 'p-2.5 justify-center'
      } ${isActive
        ? 'bg-dark-gray7 text-white'
        : 'text-dark-gray9 hover:text-white hover:bg-dark-gray/40'
      }`}
    >
      <img
        src={item.icon}
        alt={item.label}
        width={22}
        height={22}
        className={`flex-shrink-0 transition ${isActive ? 'brightness-200' : 'opacity-60 group-hover:opacity-100 group-hover:brightness-150'}`}
      />
      {expanded && (
        <span className={`font-manrope-bold text-size-14 whitespace-nowrap ${isActive ? 'text-white' : ''}`}>
          {item.label}
        </span>
      )}
    </Link>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();
  const { expanded, toggle } = useSidebarState();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  if (!mounted) return null;

  return (
    <aside
      className={`hidden sm:flex fixed left-0 top-0 bottom-0 bg-black-gray z-40 transition-all duration-200 flex-col ${
        expanded ? 'w-56' : 'w-[60px]'
      }`}
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header — logo + collapse toggle */}
        <div className={`flex items-center py-4 ${expanded ? 'px-5 gap-3' : 'px-0 justify-center'}`}>
          <Link href="/" className="flex items-center flex-shrink-0">
            {expanded ? (
              <Image src="/Kindle-Launch-wordmark.png" alt="Kindle Launch" width={140} height={36} className="h-9 w-auto" />
            ) : (
                <Image src="/Kindle-Launch-logo-dark.png" alt="Kindle Launch" width={40} height={40} className="h-9 w-auto" />
            )}
          </Link>
          {expanded && (
            <button
              onClick={toggle}
              title="Collapse sidebar"
              className="ml-auto p-1 rounded-md hover:bg-dark-gray/50 transition"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-dark-gray9 hover:text-white transition">
                <rect x="2" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="9" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            </button>
          )}
          {!expanded && (
            <button
              onClick={toggle}
              title="Expand sidebar"
              className="mt-2 p-1.5 rounded-md hover:bg-dark-gray/50 transition"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-dark-gray9 hover:text-white transition">
                <path d="M3 5.5H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 9H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M3 12.5H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Main navigation */}
        <nav className={`flex flex-col gap-1 mt-2 ${expanded ? 'px-3' : 'px-1.5'}`}>
          {mainNav.map((item) => (
            <NavButton key={item.href} item={item} isActive={isActive(item.href)} expanded={expanded} />
          ))}
        </nav>

        {/* Create coin CTA */}
        <div className={`mt-4 ${expanded ? 'px-3' : 'px-1.5'}`}>
          <Link
            href="/create"
            className={`flex items-center justify-center gap-2 rounded-xl bg-green-middle hover:bg-green-middle2 transition font-manrope-bold text-black-gray ${
              expanded ? 'px-4 py-3 text-size-14' : 'p-2.5'
            }`}
            title={expanded ? undefined : 'Create coin'}
          >
            {!expanded && (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
            {expanded && 'Create coin'}
          </Link>
        </div>

        {/* Rewards section */}
        <div className={`mt-3 ${expanded ? 'px-3' : 'px-1.5'}`}>
          <Link
            href="/rewards"
            title={expanded ? undefined : 'Rewards'}
            className={`flex items-center gap-3 rounded-xl transition ${
              expanded ? 'px-4 py-3' : 'p-2.5 justify-center'
            } ${isActive('/rewards')
              ? 'bg-dark-gray7 text-white'
              : 'text-dark-gray9 hover:text-white hover:bg-dark-gray/40'
            }`}
          >
            <img src="/icons/case.svg" alt="Rewards" width={22} height={22}
              className={`flex-shrink-0 transition ${isActive('/rewards') ? 'brightness-200' : 'opacity-60 group-hover:opacity-100'}`}
            />
            {expanded && (
              <div className="flex flex-col min-w-0">
                <span className="font-manrope-bold text-size-13">Rewards</span>
              </div>
            )}
          </Link>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Platform metrics */}
        <PlatformMetricsCompact expanded={expanded} />
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-px bg-dark-gray" />
    </aside>
  );
}

export { STORAGE_KEY };
