import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/og/pnl/:cardId.png
 *
 * Proxies OG image requests to the PnL microservice which renders
 * 1200×630 PNGs via satori + resvg. Uses the same NEXT_PUBLIC_PNL_API
 * env var as the /api/sdk/pnl proxy — microservices are only reachable
 * via internal URLs, not public Railway domains.
 *
 * The cardId is content-addressed (ULID) so rendered images are
 * immutable — cache aggressively.
 */

function getPnlBase(): string {
  const url = process.env.NEXT_PUBLIC_PNL_API;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_PNL_API is not set — cannot proxy OG image requests to PnL service',
    );
  }
  return url.replace(/\/$/, '');
}

type RouteParams = { params: Promise<{ cardId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { cardId } = await params;

  let pnlBase: string;
  try {
    pnlBase = getPnlBase();
  } catch {
    return NextResponse.json(
      { error: 'OG image service not configured' },
      { status: 503 },
    );
  }

  const upstream = `${pnlBase}/api/og/pnl/${cardId}`;

  try {
    const res = await fetch(upstream, {
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'OG image not found' },
        { status: res.status },
      );
    }

    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'public, immutable, max-age=31536000',
      },
    });
  } catch (err) {
    console.error('[og-proxy] PnL OG fetch failed:', err);
    return NextResponse.json(
      { error: 'OG image service unavailable' },
      { status: 502 },
    );
  }
}
