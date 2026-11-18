import { ProfileView } from '@/components/profile-view';
import { Loading } from '@/components/ui';
import { useMe } from '@/data/hooks';

export default function MyProfile() {
  const me = useMe().data;
  if (!me) return <Loading />;
  return <ProfileView userId={me.profile.id} own />;
}
