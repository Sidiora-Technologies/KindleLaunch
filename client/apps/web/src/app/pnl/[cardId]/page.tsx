import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PnlCardLanding from '@/widgets/pnl/pnl-card-landing';
import { getCard, getPosition } from '@/core/clients/pnl';

interface PageProps {
  params: Promise<{ cardId: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cardId } = await params;
  const card = await getCard(cardId).catch(() => null);

  if (!card) {
    return {
      title: 'PNL card not found — Sidiora',
      robots: { index: false, follow: false },
    };
  }

  const symbol = card.snapshot.tokenSymbol || 'Token';
  const name = card.snapshot.tokenName || symbol;
  const title = `${symbol} PNL on Sidiora`;
  const description = `Trade ${name} on Sidiora — the Paxeer launchpad.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: card.shareUrl,
      images: [{ url: card.ogUrl, width: 1200, height: 630, alt: `${symbol} PNL card` }],
      siteName: 'Sidiora',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [card.ogUrl],
    },
  };
}

export default async function PnlCardPage({ params }: PageProps) {
  const { cardId } = await params;

  const card = await getCard(cardId).catch(() => null);
  if (!card) notFound();

  // Live snapshot — lets the landing page show both the frozen numbers and
  // what the position looks like right now. Non-blocking: render from frozen
  // snapshot if this fails.
  const livePosition = await getPosition(
    card.snapshot.ownerAddress,
    card.snapshot.poolAddress,
  ).catch(() => null);

  return <PnlCardLanding card={card} livePosition={livePosition} />;
}
