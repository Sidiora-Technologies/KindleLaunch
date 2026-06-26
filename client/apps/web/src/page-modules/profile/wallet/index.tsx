import ProfileView from '@/widgets/profile/profile-view';
interface ProfileWalletModuleProps { walletAddress: string; }
export default function ProfileWalletModule({ walletAddress }: ProfileWalletModuleProps) {
  return <ProfileView walletAddress={walletAddress} />;
}
