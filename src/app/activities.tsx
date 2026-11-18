// Full activity history with type filter (paginated rendering via FlatList).
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';

import { RoutePreview } from '@/components/route-preview';
import { ACTIVITY_COLORS, ActivityIcon, Chip, Empty, Header, Loading, Row, T, type MciName } from '@/components/ui';
import { useMyActivities } from '@/data/hooks';
import { ACTIVITY_META, duration, km, pace, shortDate } from '@/lib/format';
import type { ActivityType } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Activities() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useMyActivities();
  const [type, setType] = useState<ActivityType | 'all'>('all');
  const types = useMemo(() => [...new Set((q.data ?? []).map((a) => a.type))], [q.data]);
  const list = useMemo(() => (q.data ?? []).filter((a) => type === 'all' || a.type === type), [q.data, type]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <Header title="Activity history" subtitle={`${list.length} activities`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2), paddingHorizontal: space(4), paddingBottom: space(3) }} style={{ flexGrow: 0 }}>
        <Chip label="All" active={type === 'all'} onPress={() => setType('all')} />
        {types.map((t) => <Chip key={t} label={ACTIVITY_META[t].label} icon={ACTIVITY_META[t].icon as MciName} active={type === t} onPress={() => setType(t)} />)}
      </ScrollView>
      {q.isLoading ? <Loading /> : (
        <FlatList
          data={list}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: insets.bottom + 24, gap: space(2) }}
          initialNumToRender={12}
          windowSize={9}
          ListEmptyComponent={<Empty icon="walk-outline" title="No activities" />}
          renderItem={({ item: a }) => (
            <Pressable onPress={() => router.push(`/activity/${a.id}`)} style={({ pressed }) => ({ flexDirection: 'row', gap: space(3), alignItems: 'center', backgroundColor: c.surface, borderRadius: radius.lg, padding: space(3), borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.85 : 1 })}>
              {a.map_polyline ? (
                <RoutePreview polyline={a.map_polyline} height={56} style={{ width: 56 }} rounded={12} color={ACTIVITY_COLORS[a.type]} />
              ) : <ActivityIcon type={a.type} size={56} />}
              <View style={{ flex: 1, gap: 2 }}>
                <T v="h3" numberOfLines={1}>{a.title}</T>
                <T v="small" color={c.muted}>{shortDate(a.started_at)} · {ACTIVITY_META[a.type].label}</T>
                <Row gap={3}>
                  {a.distance_m ? <T v="small" style={{ fontWeight: '700' }}>{km(a.distance_m)} km</T> : null}
                  <T v="small" style={{ fontWeight: '700' }}>{duration(a.moving_time_s, true)}</T>
                  {a.avg_pace_s_km && a.type !== 'ride' ? <T v="small" color={c.muted}>{pace(a.avg_pace_s_km)} /km</T> : null}
                </Row>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
