import TokenMarketLayout from '@/widgets/trading/token-market-layout';
interface TokenModuleProps { poolAddress: string; }
export default function TokenModule({ poolAddress }: TokenModuleProps) {
  return <TokenMarketLayout poolAddress={poolAddress} />;
}
