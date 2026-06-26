import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ shortCode: string }>;
  searchParams: Promise<{ cardId?: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { cardId } = await searchParams;
  if (cardId) {
    return {
      title: 'Sidiora — View PNL Card',
      description: 'See this trade on Sidiora, the Paxeer Network launchpad.',
    };
  }
  return {
    title: 'Sidiora — Join via Referral',
    description: 'Trade on Sidiora, the Paxeer Network launchpad.',
  };
}

export default async function ReferralRedirect({ params, searchParams }: PageProps) {
  const { shortCode } = await params;
  const { cardId } = await searchParams;

  if (cardId) {
    redirect(`/pnl/${cardId}?ref=${shortCode}`);
  }

  redirect(`/?ref=${shortCode}`);
}
