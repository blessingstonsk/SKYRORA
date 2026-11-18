import { useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/profile-view';
import { useMe } from '@/data/hooks';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe().data;
  return <ProfileView userId={id} own={me?.profile.id === id} />;
}
