import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { LeaderRow } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

import { Avatar, Card, Empty, Row, T } from './ui';

const MEDALS = ['#FFD54A', '#C9D3E0', '#E0A46E'];

export function LeaderList({ rows, unit, meId, format = (v) => v.toLocaleString() }: { rows: LeaderRow[]; unit: string; meId?: string; format?: (v: number) => string }) {
  const { c } = useTheme();
  const router = useRouter();
  if (!rows.length) return <Card><Empty icon="podium-outline" title="No one on the board yet" body="Record an activity to be the first." /></Card>;
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {rows.map((r, i) => {
        const mine = r.user_id === meId;
        return (
          <Pressable key={r.user_id} onPress={() => router.push(`/user/${r.user_id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3), backgroundColor: mine ? c.primary + '14' : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <View style={{ width: 28, alignItems: 'center' }}>
              {r.rank <= 3 ? <Ionicons name="medal" size={20} color={MEDALS[r.rank - 1]} /> : <T v="h3" color={c.muted}>{r.rank}</T>}
            </View>
            <Avatar name={r.full_name ?? r.username} uri={r.avatar_url} size={38} />
            <View style={{ flex: 1 }}>
              <T v="h3" numberOfLines={1}>{r.full_name ?? r.username}{mine ? ' (you)' : ''}</T>
              <T v="small" color={c.muted}>@{r.username}</T>
            </View>
            <Row gap={1} style={{ alignItems: 'baseline' }}>
              {r.completed ? <Ionicons name="checkmark-circle" size={14} color={c.success} /> : null}
              <T v="h3" style={{ fontVariant: ['tabular-nums'] }}>{format(r.value)}</T>
              <T v="small" color={c.muted}>{unit}</T>
            </Row>
          </Pressable>
        );
      })}
      <View style={{ height: 1, borderRadius: radius.sm }} />
    </Card>
  );
}
