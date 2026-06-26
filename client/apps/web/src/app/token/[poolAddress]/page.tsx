import TokenModule from '@/page-modules/token';
interface Props { params: Promise<{ poolAddress: string }>; }
export default async function TokenMarketPage({ params }: Props) {
  const { poolAddress } = await params;
  return <TokenModule poolAddress={poolAddress} />;
}
