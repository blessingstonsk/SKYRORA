import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { Challenge } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

import { ProgressBar, Row, T } from './ui';

export function daysLeft(c: Challenge) {
  const ms = new Date(c.ends_at).getTime() - Date.now();
  if (ms < 0) return 'Ended';
  const d = Math.ceil(ms / 86400000);
  return d <= 1 ? 'Ends today' : `${d} days left`;
}

export function challengeIcon(c: Challenge): React.ComponentProps<typeof Ionicons>['name'] {
  return c.metric === 'active_days' ? 'calendar' : c.metric === 'calories' ? 'flame' : c.activity_types.includes('ride') ? 'bicycle' : 'trophy';
}

export function ChallengeCard({ ch, compact }: { ch: Challenge; compact?: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const joined = ch.my_progress != null;
  const pct = joined ? Math.min(100, ((ch.my_progress ?? 0) / ch.target_value) * 100) : 0;
  const done = !!ch.my_completed_at || pct >= 100;
  return (
    <Pressable onPress={() => router.push(`/challenge/${ch.id}`)} accessibilityRole="button" accessibilityLabel={ch.title}
      style={({ pressed }) => [{ width: compact ? 260 : undefined, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, pressed && { opacity: 0.9 }]}>
      <LinearGradient colors={[ch.accent + 'CC', ch.accent + '22']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: space(4), gap: space(2), minHeight: 96 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#00000033', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={challengeIcon(ch)} size={20} color="#fff" />
          </View>
          {done ? (
            <Row gap={1} style={{ backgroundColor: '#00000044', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 }}>
              <Ionicons name="checkmark-circle" size={14} color="#fff" /><T v="small" color="#fff" style={{ fontWeight: '800' }}>Completed</T>
            </Row>
          ) : (
            <T v="small" color="#fff" style={{ fontWeight: '700' }}>{daysLeft(ch)}</T>
          )}
        </Row>
        <T v="h2" color="#fff">{ch.title}</T>
      </LinearGradient>
      <View style={{ padding: space(4), gap: space(3) }}>
        {!compact ? <T v="small" color={c.muted} numberOfLines={2}>{ch.description}</T> : null}
        {joined ? (
          <>
            <ProgressBar pct={pct} color={ch.accent} />
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="small" style={{ fontWeight: '700' }}>{(ch.my_progress ?? 0).toLocaleString()} / {ch.target_value.toLocaleString()} {ch.unit}</T>
              <T v="small" color={c.muted}>{Math.round(pct)}%</T>
            </Row>
          </>
        ) : (
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={1}><Ionicons name="people" size={14} color={c.muted} /><T v="small" color={c.muted}>{ch.participant_count ?? 0} joined</T></Row>
            <T v="small" color={c.primary} style={{ fontWeight: '800' }}>Join →</T>
          </Row>
        )}
      </View>
    </Pressable>
  );
}
