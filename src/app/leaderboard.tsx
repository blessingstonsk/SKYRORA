import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { LeaderList } from '@/components/leader-list';
import { Chip, Header, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useLeaderboard, useMe } from '@/data/hooks';
import { startOfMonth, startOfWeek } from '@/lib/stats';
import type { LeaderMetric, LeaderScope } from '@/lib/types';
import { space, useTheme } from '@/theme';

const METRICS: { key: LeaderMetric; label: string; unit: string }[] = [
  { key: 'distance', label: 'Distance', unit: 'km' },
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'count', label: 'Workouts', unit: '' },
  { key: 'duration', label: 'Time', unit: 'h' },
];

export default function Leaderboard() {
  const { c } = useTheme();
  const me = useMe().data;
  const [scope, setScope] = useState<LeaderScope>('friends');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [metric, setMetric] = useState<LeaderMetric>('distance');
  const since = useMemo(() => (period === 'week' ? startOfWeek() : startOfMonth()), [period]);
  const q = useLeaderboard(metric, since, scope);
  const m = METRICS.find((x) => x.key === metric)!;
  const myRank = q.data?.find((r) => r.user_id === me?.profile.id);

  return (
    <Screen header={<Header title="Leaderboards" />} bottomInset={false}>
      <Segmented options={[{ key: 'friends', label: 'Friends' }, { key: 'local', label: 'Local' }, { key: 'global', label: 'Global' }]} value={scope} onChange={setScope} />
      <Segmented options={[{ key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }]} value={period} onChange={setPeriod} />
      <Row gap={2} wrap>
        {METRICS.map((x) => <Chip key={x.key} label={x.label} active={metric === x.key} onPress={() => setMetric(x.key)} />)}
      </Row>
      {myRank ? (
        <View style={{ alignItems: 'center', gap: 2, paddingVertical: space(2) }}>
          <T v="label" color={c.muted}>Your rank</T>
          <T v="hero" color={c.primary}>#{myRank.rank}</T>
          <T v="small" color={c.muted}>{myRank.value.toLocaleString()} {m.unit} of {q.data?.length} athletes</T>
        </View>
      ) : null}
      {q.isLoading ? <Loading /> : <LeaderList rows={q.data ?? []} unit={m.unit} meId={me?.profile.id} />}
      <T v="small" color={c.faint} center>Private profiles and athletes who opted out of leaderboards are never shown. Manage this in Settings → Privacy.</T>
    </Screen>
  );
}
