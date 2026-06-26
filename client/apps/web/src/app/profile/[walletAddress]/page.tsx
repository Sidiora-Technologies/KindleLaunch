import ProfileWalletModule from '@/page-modules/profile/wallet';
interface Props { params: Promise<{ walletAddress: string }>; }
export default async function ProfilePage({ params }: Props) {
  const { walletAddress } = await params;
  return <ProfileWalletModule walletAddress={walletAddress} />;
}
