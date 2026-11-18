// OAuth redirect target. Supabase picks the session up from the URL on web;
// the auth guard in the root layout then routes to the right place.
import { Redirect } from 'expo-router';

import { Loading } from '@/components/ui';
import { useAuth } from '@/state/auth';

export default function AuthCallback() {
  const { ready, session } = useAuth();
  if (!ready) return <Loading />;
  return <Redirect href={session ? '/' : '/welcome'} />;
}
