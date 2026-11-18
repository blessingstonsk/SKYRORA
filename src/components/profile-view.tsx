import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAchievements, useFollow, useFollowStats, useMyActivities, useProfile, useUserActivities } from '@/data/hooks';
import { ACTIVITY_META, duration, km } from '@/lib/format';
import { currentStreak, totals } from '@/lib/stats';
import type { Activity, ActivityType } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

import { ActivityCard } from './activity-card';
import { BadgeTile } from './badges';
import { ACTIVITY_COLORS, Avatar, Button, Card, Empty, IconButton, ListItem, Loading, ProgressBar, Row, SectionTitle, T, type MciName } from './ui';

export function ProfileView({ userId, own }: { userId: string; own: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const profile = useProfile(userId);
  const stats = useFollowStats(userId);
  const follow = useFollow(userId);
  const ach = useAchievements(userId).data ?? [];
  const mine = useMyActivities();
  const theirs = useUserActivities(userId);

  const feedItems = useMemo(() => theirs.data?.pages.flatMap((p) => p.items) ?? [], [theirs.data]);
  const all: Activity[] = useMemo(() => (own ? mine.data ?? [] : feedItems), [own, mine.data, feedItems]);
  const t = useMemo(() => totals(all), [all]);
  const streak = useMemo(() => currentStreak(all), [all]);
  const byType = useMemo(() => {
    const m = new Map<ActivityType, number>();
    all.forEach((a) => m.set(a.type, (m.get(a.type) ?? 0) + a.moving_time_s));
    const total = [...m.values()].reduce((s, v) => s + v, 0) || 1;
    return [...m].sort((a, b) => b[1] - a[1]).map(([type, s]) => ({ type, pct: (s / total) * 100, s }));
  }, [all]);

  const p = profile.data;
  const st = stats.data;
  const locked = !own && p?.visibility !== 'public' && st?.status !== 'following';
  const earned = ach.filter((a) => a.earned_at);

  const refresh = () => Promise.all([profile.refetch(), stats.refetch(), theirs.refetch(), own ? mine.refetch() : null, qc.invalidateQueries({ queryKey: ['achievements'] })]);

  if (profile.isLoading) return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}><Loading /></View>;
  if (!p) return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}><Empty icon="person-outline" title="Athlete not found" /></View>;

  const header = (
    <View style={{ gap: space(4) }}>
      <LinearGradient colors={['#2EE6C540', '#7C6CFF30', c.bg]} style={{ paddingTop: insets.top + space(2), paddingHorizontal: space(4), paddingBottom: space(2), gap: space(4) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          {own ? <View /> : <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} />}
          {own ? (
            <Row gap={2}>
              <IconButton icon="notifications-outline" label="Notifications" onPress={() => router.push('/notifications')} />
              <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
            </Row>
          ) : <View />}
        </Row>
        <View style={{ alignItems: 'center', gap: space(2) }}>
          <Avatar name={p.full_name ?? p.username} uri={p.avatar_url} size={96} ring />
          <T v="h1" center>{p.full_name ?? p.username}</T>
          <Row gap={2}>
            <T v="small" color={c.muted}>@{p.username}</T>
            {p.visibility !== 'public' ? <Ionicons name={p.visibility === 'private' ? 'lock-closed' : 'people'} size={12} color={c.muted} /> : null}
            {p.location_label ? <T v="small" color={c.muted}>· {p.location_label}</T> : null}
          </Row>
          {p.bio ? <T v="body" color={c.muted} center style={{ maxWidth: 320 }}>{p.bio}</T> : null}
        </View>
        <Row style={{ justifyContent: 'center' }} gap={8}>
          <Count n={st?.followers ?? 0} label="Followers" />
          <Count n={st?.following ?? 0} label="Following" />
          <Count n={t.count} label="Activities" />
        </Row>
        {own ? (
          <Row gap={3}>
            <Button title="Edit profile" variant="secondary" size="md" icon="create-outline" onPress={() => router.push('/edit-profile')} style={{ flex: 1 }} />
            <Button title="Share" variant="secondary" size="md" icon="share-social-outline" onPress={() => Share.share({ message: `Follow ${p.full_name ?? p.username} (@${p.username}) on SKYRO` }).catch(() => {})} style={{ flex: 1 }} />
          </Row>
        ) : (
          <Button
            title={st?.status === 'following' ? 'Following' : st?.status === 'pending' ? 'Requested' : p.visibility === 'public' ? 'Follow' : 'Request to follow'}
            variant={st?.status === 'none' ? 'primary' : 'secondary'}
            icon={st?.status === 'following' ? 'checkmark' : 'person-add-outline'}
            loading={follow.isPending}
            onPress={() => follow.mutate(st?.status === 'none')}
          />
        )}
      </LinearGradient>

      {locked ? (
        <View style={{ paddingHorizontal: space(4) }}>
          <Card><Empty icon="lock-closed-outline" title="This account is private" body="Follow to see their activities once they accept." /></Card>
        </View>
      ) : (
        <View style={{ paddingHorizontal: space(4), gap: space(4) }}>
          <Row gap={3}>
            <Big label="Distance" value={km(t.distance_m, 0)} unit="km" />
            {t.moving_time_s >= 36000
              ? <Big label="Active time" value={String(Math.round(t.moving_time_s / 3600))} unit="h" />
              : <Big label="Active time" value={duration(t.moving_time_s, true)} />}
            <Big label="Streak" value={String(streak)} unit="days" color={c.warm} />
          </Row>

          {own ? (
            <Card padded={false} style={{ paddingHorizontal: space(4) }}>
              <ListItem icon="analytics" iconColor={c.primary} title="Analytics" subtitle="Trends, consistency and insights" onPress={() => router.push('/analytics')} />
              <ListItem icon="scale" iconColor={c.info} title="Weight" subtitle="Log weight and see your trend" onPress={() => router.push('/weight')} />
              <ListItem icon="flag" iconColor={c.secondary} title="Goals" onPress={() => router.push('/goals')} />
              <ListItem icon="time" iconColor={c.muted} title="All activities" onPress={() => router.push('/activities')} />
            </Card>
          ) : null}

          <SectionTitle title="Achievements" action="All" onAction={() => router.push(own ? '/records' : '/records')} />
          {ach.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
              {[...earned, ...ach.filter((a) => !a.earned_at)].map((a) => <BadgeTile key={a.id} a={a} />)}
            </ScrollView>
          ) : null}

          {byType.length ? (
            <Card style={{ gap: space(3) }}>
              <T v="h3">Fitness mix</T>
              {byType.map((b) => (
                <View key={b.type} style={{ gap: 6 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={2}>
                      <MaterialCommunityIcons name={ACTIVITY_META[b.type].icon as MciName} size={16} color={ACTIVITY_COLORS[b.type]} />
                      <T v="small" style={{ fontWeight: '700' }}>{ACTIVITY_META[b.type].label}</T>
                    </Row>
                    <T v="small" color={c.muted}>{duration(b.s, true)} · {Math.round(b.pct)}%</T>
                  </Row>
                  <ProgressBar pct={b.pct} color={ACTIVITY_COLORS[b.type]} height={6} />
                </View>
              ))}
            </Card>
          ) : null}

          <SectionTitle title="Recent activities" />
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      data={locked ? [] : feedItems}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <View style={{ paddingHorizontal: space(4), marginTop: space(4) }}><ActivityCard a={item} showUser={false} /></View>}
      ListEmptyComponent={locked ? undefined : theirs.isLoading ? <Loading /> : <View style={{ padding: space(4) }}><Empty icon="walk-outline" title="No activities yet" /></View>}
      ListFooterComponent={<View style={{ height: 130 }}>{theirs.isFetchingNextPage ? <Loading /> : null}</View>}
      onEndReached={() => theirs.hasNextPage && !theirs.isFetchingNextPage && theirs.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refresh(); }} tintColor={c.primary} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

function Count({ n, label }: { n: number; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable style={{ alignItems: 'center' }}>
      <T v="h2">{n.toLocaleString()}</T>
      <T v="small" color={c.muted}>{label}</T>
    </Pressable>
  );
}

function Big({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: space(3), borderWidth: 1, borderColor: c.border }}>
      <T v="label" color={c.muted}>{label}</T>
      <Row gap={1} style={{ alignItems: 'baseline', marginTop: 4 }}>
        <T v="stat" style={{ fontSize: 22 }} color={color}>{value}</T>
        {unit ? <T v="small" color={c.muted}>{unit}</T> : null}
      </Row>
    </View>
  );
}
