import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Platform, Pressable, ScrollView, Share, View } from 'react-native';

import { useLike } from '@/data/hooks';
import { ACTIVITY_META, duration, km, pace, relativeTime, speedKmh } from '@/lib/format';
import type { Activity } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

import { RoutePreview } from './route-preview';
import { ACTIVITY_COLORS, ActivityIcon, Avatar, Row, Stat, T } from './ui';

export function primaryStats(a: Activity): { value: string; unit?: string; label: string }[] {
  if (a.type === 'strength' || a.type === 'yoga' || (!a.distance_m && a.type !== 'run')) {
    const sets = a.sets?.length ?? 0;
    return [
      { value: duration(a.moving_time_s, true), label: 'Time' },
      { value: String(a.calories), unit: 'kcal', label: 'Calories' },
      ...(sets ? [{ value: String(sets), label: 'Sets' }] : []),
    ];
  }
  const speedish = a.type === 'ride'
    ? { value: speedKmh(a.avg_speed_mps), unit: 'km/h', label: 'Avg speed' }
    : { value: pace(a.avg_pace_s_km), unit: '/km', label: 'Pace' };
  return [{ value: km(a.distance_m), unit: 'km', label: 'Distance' }, speedish, { value: duration(a.moving_time_s, true), label: 'Time' }];
}

export const ActivityCard = memo(function ActivityCard({ a, showUser = true }: { a: Activity; showUser?: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const like = useLike();
  const name = a.profile?.full_name ?? a.profile?.username ?? 'You';

  const onLike = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    like.mutate({ id: a.id, liked: !a.liked_by_me });
  };
  const onShare = () =>
    Share.share({ message: `${a.title} — ${a.distance_m ? km(a.distance_m) + ' km · ' : ''}${duration(a.moving_time_s, true)} on SKYRO` }).catch(() => {});

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
      <Pressable onPress={() => router.push(`/activity/${a.id}`)} accessibilityRole="button" accessibilityLabel={`${a.title} by ${name}`}>
        <View style={{ padding: space(4), gap: space(3) }}>
          {showUser ? (
            <Row>
              <Pressable onPress={() => a.profile && router.push(`/user/${a.profile.id}`)} hitSlop={6}>
                <Avatar name={name} uri={a.profile?.avatar_url} size={40} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <T v="h3" numberOfLines={1}>{name}</T>
                <Row gap={1}>
                  <T v="small" color={c.muted}>{relativeTime(a.started_at)} · {ACTIVITY_META[a.type].label}</T>
                  {a.visibility !== 'public' ? <Ionicons name={a.visibility === 'private' ? 'lock-closed' : 'people'} size={12} color={c.muted} /> : null}
                </Row>
              </View>
              <ActivityIcon type={a.type} size={36} />
            </Row>
          ) : (
            <Row>
              <ActivityIcon type={a.type} size={36} />
              <T v="small" color={c.muted} style={{ flex: 1 }}>{relativeTime(a.started_at)}</T>
            </Row>
          )}
          <View style={{ gap: 4 }}>
            <T v="h2" numberOfLines={2}>{a.title}</T>
            {a.description ? <T v="body" color={c.muted} numberOfLines={2}>{a.description}</T> : null}
          </View>
          <Row gap={6}>
            {primaryStats(a).map((s) => <Stat key={s.label} {...s} />)}
          </Row>
        </View>
        {a.map_polyline ? <RoutePreview polyline={a.map_polyline} height={170} color={ACTIVITY_COLORS[a.type]} /> : null}
        {a.photos?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
            {a.photos.map((p) => <Image key={p} source={{ uri: p }} style={{ width: a.photos!.length === 1 ? 360 : 240, height: 200 }} contentFit="cover" transition={200} />)}
          </ScrollView>
        ) : null}
      </Pressable>
      <Row gap={1} style={{ paddingHorizontal: space(2), paddingVertical: space(1), borderTopWidth: 1, borderTopColor: c.border }}>
        <Action icon={a.liked_by_me ? 'heart' : 'heart-outline'} color={a.liked_by_me ? c.danger : c.muted} label={a.like_count ? String(a.like_count) : 'Like'} onPress={onLike} a11y={a.liked_by_me ? 'Unlike' : 'Like'} />
        <Action icon="chatbubble-outline" color={c.muted} label={a.comment_count ? String(a.comment_count) : 'Comment'} onPress={() => router.push(`/activity/${a.id}?focus=comment`)} a11y="Comment" />
        <View style={{ flex: 1 }} />
        <Action icon="share-outline" color={c.muted} label="" onPress={onShare} a11y="Share" />
      </Row>
    </View>
  );
});

function Action({ icon, color, label, onPress, a11y }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; onPress(): void; a11y: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={4}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 20, backgroundColor: pressed ? c.surface2 : 'transparent' })}>
      <Ionicons name={icon} size={20} color={color} />
      {label ? <T v="small" color={c.muted} style={{ fontWeight: '700' }}>{label}</T> : null}
    </Pressable>
  );
}
