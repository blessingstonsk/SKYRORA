import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { BadgeTile } from '@/components/badges';
import { Card, Empty, Header, Loading, Row, Screen, T } from '@/components/ui';
import { useAchievements, useMe, useMyActivities } from '@/data/hooks';
import { duration, km, pace, shortDate } from '@/lib/format';
import { computeRecords, RECORD_META } from '@/lib/stats';
import type { PersonalRecord } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

function formatRecord(r: PersonalRecord) {
  const kind = RECORD_META[r.record].kind;
  if (kind === 'time') {
    const dist = r.record === 'fastest_1k' ? 1 : r.record === 'fastest_5k' ? 5 : 10;
    return { main: duration(r.value), sub: `${pace(r.value / dist)} /km` };
  }
  if (kind === 'distance') return { main: `${km(r.value)} km`, sub: '' };
  if (kind === 'kcal') return { main: `${Math.round(r.value).toLocaleString()} kcal`, sub: '' };
  if (kind === 'duration') return { main: duration(r.value, true), sub: 'active time' };
  return { main: `${r.value} days`, sub: 'in a row' };
}

export default function Records() {
  const { c } = useTheme();
  const router = useRouter();
  const me = useMe().data;
  const acts = useMyActivities();
  const ach = useAchievements(me?.profile.id);
  const records = useMemo(() => computeRecords(acts.data ?? []), [acts.data]);
  const earned = (ach.data ?? []).filter((a) => a.earned_at).length;

  return (
    <Screen header={<Header title="Records & badges" />} bottomInset={false}>
      <T v="h2">Personal records</T>
      {acts.isLoading ? <Loading /> : records.length === 0 ? <Empty icon="trophy-outline" title="No records yet" body="Records are detected automatically as you log activities." /> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
          {records.map((r) => {
            const f = formatRecord(r);
            return (
              <Pressable key={r.record} onPress={() => r.activity_id && router.push(`/activity/${r.activity_id}`)}
                style={{ width: '47.5%', backgroundColor: c.surface, borderRadius: radius.lg, padding: space(4), gap: 6, borderWidth: 1, borderColor: c.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.warm + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={RECORD_META[r.record].icon as 'flash'} size={18} color={c.warm} />
                </View>
                <T v="small" color={c.muted}>{RECORD_META[r.record].label}</T>
                <T v="h2">{f.main}</T>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="small" color={c.faint}>{f.sub}</T>
                  {r.activity_id ? <T v="small" color={c.faint}>{shortDate(r.achieved_at)}</T> : null}
                </Row>
              </Pressable>
            );
          })}
        </View>
      )}

      <Row style={{ justifyContent: 'space-between', marginTop: space(2) }}>
        <T v="h2">Badges</T>
        <T v="small" color={c.muted}>{earned} / {ach.data?.length ?? 0} earned</T>
      </Row>
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3), justifyContent: 'space-between' }}>
          {(ach.data ?? []).map((a) => (
            <View key={a.id} style={{ alignItems: 'center', gap: 4, width: '30%' }}>
              <BadgeTile a={a} />
              <T v="small" color={c.faint} center style={{ fontSize: 10 }} numberOfLines={2}>{a.earned_at ? shortDate(a.earned_at) : a.description}</T>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
