import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { ChallengeCard } from '@/components/challenge-card';
import { Card, Empty, ErrorNote, ListItem, Loading, Screen, Segmented, T } from '@/components/ui';
import { useAchievements, useChallenges, useMe } from '@/data/hooks';
import { space, useTheme } from '@/theme';

export default function Challenges() {
  const { c } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<'active' | 'joined' | 'done'>('active');
  const q = useChallenges();
  const me = useMe().data;
  const ach = useAchievements(me?.profile.id).data ?? [];
  const now = new Date().toISOString();
  const list = (q.data ?? []).filter((ch) =>
    tab === 'active' ? ch.ends_at >= now && ch.my_progress == null
    : tab === 'joined' ? ch.my_progress != null && !ch.my_completed_at && ch.ends_at >= now
    : !!ch.my_completed_at);

  return (
    <Screen refresh={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={c.primary} />}>
      <View style={{ gap: space(1), marginTop: space(2) }}>
        <T v="h1">Challenges</T>
        <T v="body" color={c.muted}>Push yourself, earn badges, climb the board.</T>
      </View>
      <Card onPress={() => router.push('/leaderboard')} padded={false} style={{ paddingHorizontal: space(4) }}>
        <ListItem icon="podium" iconColor={c.warm} title="Leaderboards" subtitle="Friends, local and global rankings" onPress={() => router.push('/leaderboard')} />
      </Card>
      <Card onPress={() => router.push('/records')} padded={false} style={{ paddingHorizontal: space(4) }}>
        <ListItem icon="ribbon" iconColor={c.secondary} title="Badges & records" subtitle={`${ach.filter((a) => a.earned_at).length} of ${ach.length} badges earned`} onPress={() => router.push('/records')} />
      </Card>
      <Segmented options={[{ key: 'active', label: 'Discover' }, { key: 'joined', label: 'Joined' }, { key: 'done', label: 'Completed' }]} value={tab} onChange={setTab} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={() => q.refetch()} /> : list.length === 0 ? (
        <Empty icon="trophy-outline" title={tab === 'done' ? 'No completed challenges yet' : tab === 'joined' ? 'You have not joined any challenges' : 'You have joined them all!'} body={tab === 'joined' ? 'Discover a challenge and hit Join.' : undefined} />
      ) : (
        <View style={{ gap: space(4) }}>
          {list.map((ch) => <ChallengeCard key={ch.id} ch={ch} />)}
        </View>
      )}
    </Screen>
  );
}
