import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { cookieToInitialState } from 'wagmi';
import { wagmiConfig } from '@/core/wagmi-config';
import AppProviders from '@/ui/providers/app-providers';
import AppShell from '@/shell/app-shell';
import PlatformRulesModal from '@/ui/shared/platform-rules-modal';
import CookieBanner from '@/ui/shared/cookie-banner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kindle',
  description: 'Kindle — Token Launchpad on Paxeer Network',
  icons: {
    icon: '/Kindle-Launch-logo-dark.png',
    shortcut: '/Kindle-Launch-logo-dark.png',
    apple: '/Kindle-Launch-logo-dark.png',
  },
  manifest: '/manifest.json',
  other: {
    'theme-color': '#44E8C8',
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const hdrs = await headers();
  const cookie = hdrs.get('cookie') ?? '';
  const wagmiInitialState = cookieToInitialState(wagmiConfig, cookie);

  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#44E8C8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <PlatformRulesModal />
        <CookieBanner />
        <AppProviders wagmiInitialState={wagmiInitialState}>
          <AppShell>
            {children}
          </AppShell>
        </AppProviders>
      </body>
    </html>
  );
}