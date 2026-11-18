import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCard } from '@/components/activity-card';
import { Wordmark } from '@/components/brand';
import { BarChart, Ring } from '@/components/charts';
import { GoalRow } from '@/components/goal-row';
import {
  Avatar, Button, Card, Empty, ErrorNote, IconButton, Loading, MiniStat, Row, SectionTitle, Segmented, T,
} from '@/components/ui';
import { useFeed, useFollow, useMe, useNotifications, useSuggested } from '@/data/hooks';
import { useOutbox } from '@/data/outbox';
import { useDashboard } from '@/hooks/use-dashboard';
import { duration, greeting, int, km } from '@/lib/format';
import { pctChange } from '@/lib/stats';
import type { Profile } from '@/lib/types';
import { useRecorder } from '@/state/recorder';
import { radius, space, useTheme } from '@/theme';

export default function Home() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<'today' | 'feed'>('today');
  const me = useMe().data;
  const unread = (useNotifications().data ?? []).filter((n) => !n.read_at).length;

  const header = (
    <View style={{ paddingHorizontal: space(4), gap: space(4), paddingBottom: space(2) }}>
      <Row style={{ justifyContent: 'space-between', paddingTop: space(2) }}>
        <Wordmark size={20} />
        <Row gap={2}>
          <IconButton icon="search" label="Search" onPress={() => router.push('/explore')} />
          <IconButton icon="notifications-outline" label={`Notifications, ${unread} unread`} badge={unread} onPress={() => router.push('/notifications')} />
        </Row>
      </Row>
      <Segmented options={[{ key: 'today', label: 'Today' }, { key: 'feed', label: 'Feed' }]} value={tab} onChange={setTab} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {tab === 'today' ? <Today header={header} name={me?.profile.full_name?.split(' ')[0] ?? 'athlete'} /> : <Feed header={header} />}
    </View>
  );
}

function Today({ header, name }: { header: React.ReactNode; name: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const d = useDashboard();
  const pending = useOutbox((s) => s.pending.length);
  const recStatus = useRecorder((s) => s.status);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await d.refetch();
    setRefreshing(false);
  };

  const stepPct = (d.today.steps / d.stepGoal) * 100;
  const wkChange = pctChange(d.week.distance_m, d.lastWeek.distance_m);

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 130, gap: space(4) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} />}
      showsVerticalScrollIndicator={false}>
      {header}
      <View style={{ paddingHorizontal: space(4), gap: space(4) }}>
        <View>
          <T v="body" color={c.muted}>{greeting()},</T>
          <T v="h1">{name} 👋</T>
        </View>

        {recStatus !== 'idle' ? (
          <Card onPress={() => router.push(recStatus === 'finished' ? '/activity/finish' : '/record')} style={{ borderColor: c.danger, backgroundColor: c.danger + '14' }}>
            <Row>
              <Ionicons name="radio-button-on" size={20} color={c.danger} />
              <T v="h3" style={{ flex: 1 }}>{recStatus === 'finished' ? 'Finish saving your activity' : 'Activity in progress'}</T>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </Row>
          </Card>
        ) : null}
        {pending ? (
          <Card style={{ borderColor: c.warm + '66' }}>
            <Row>
              <Ionicons name="cloud-upload-outline" size={20} color={c.warm} />
              <T v="small" style={{ flex: 1 }}>{pending} activit{pending === 1 ? 'y' : 'ies'} saved offline — will sync when you&apos;re back online.</T>
            </Row>
          </Card>
        ) : null}

        {d.loading ? <Loading /> : d.error ? <ErrorNote error={d.error} onRetry={refresh} /> : (
          <>
            {/* Today hero */}
            <LinearGradient colors={['#10302D', '#141A33']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: space(5), gap: space(5), borderWidth: 1, borderColor: '#ffffff12' }}>
              <Row gap={5}>
                <Ring pct={stepPct} size={128} stroke={13} color="#2EE6C5" track="#ffffff14">
                  <T v="stat" color="#fff">{int(d.today.steps)}</T>
                  <T v="label" color="#ffffffaa">steps</T>
                </Ring>
                <View style={{ flex: 1, gap: space(3) }}>
                  <HeroStat icon="flame" color="#FF7A8F" value={int(d.today.calories)} unit="kcal" />
                  <HeroStat icon="navigate" color="#4DA3FF" value={km(d.today.distance_m)} unit="km" />
                  <HeroStat icon="time" color="#B4A9FF" value={duration(d.today.moving_time_s, true)} unit="active" />
                </View>
              </Row>
              <T v="small" color="#ffffffaa">
                {stepPct >= 100 ? 'Step goal smashed today. 🎉' : `${int(Math.max(0, d.stepGoal - d.today.steps))} steps to your daily goal`}
              </T>
            </LinearGradient>

            <Button title="Start Activity" icon="play" onPress={() => router.push('/record')} />

            <Row gap={3} wrap>
              <MiniStat icon="scale-outline" color={c.primary} value={d.weight.latest ? `${d.weight.latest.toFixed(1)} kg` : '—'} label={d.weight.totalChange ? `${d.weight.totalChange > 0 ? '+' : ''}${d.weight.totalChange} kg total` : 'Current weight'} />
              <MiniStat icon="flame" color={c.warm} value={`${d.streak} day${d.streak === 1 ? '' : 's'}`} label="Current streak" />
            </Row>
            <Row gap={3} wrap>
              <MiniStat icon="calendar" color={c.secondary} value={`${d.week.count}/${d.workoutGoal}`} label="Workouts this week" />
              <MiniStat icon="bonfire-outline" color={c.danger} value={int(d.week.calories)} label="kcal this week" />
            </Row>

            <Card onPress={() => router.push('/analytics')} style={{ gap: space(3) }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View>
                  <T v="label" color={c.muted}>This week</T>
                  <Row gap={2} style={{ alignItems: 'baseline' }}>
                    <T v="stat">{km(d.week.distance_m, 1)}</T>
                    <T v="small" color={c.muted}>km</T>
                    {wkChange != null ? <T v="small" color={wkChange >= 0 ? c.success : c.danger} style={{ fontWeight: '700' }}>{wkChange >= 0 ? '▲' : '▼'} {Math.abs(wkChange)}% vs last week</T> : null}
                  </Row>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.faint} />
              </Row>
              <BarChart data={d.weekBars.map((b) => ({ label: b.label, value: b.distance_m / 1000 }))} height={120} format={(v) => `${v.toFixed(1)} km`} />
            </Card>

            <SectionTitle title="Goals" action="Manage" onAction={() => router.push('/goals')} />
            <Card style={{ gap: space(4) }}>
              {d.goals.length ? d.goals.slice(0, 4).map((g) => (
                <GoalRow key={g.id} goal={g} acts={d.activities} weight={d.weight.latest} steps={d.today.steps} />
              )) : <Empty icon="flag-outline" title="No goals yet" body="Set a goal to stay on track." action="Add a goal" onAction={() => router.push('/goals')} />}
            </Card>

            <Row gap={3}>
              <Shortcut icon="scale-outline" label="Log weight" onPress={() => router.push('/weight')} />
              <Shortcut icon="barbell-outline" label="Log workout" onPress={() => router.push('/activity/log')} />
              <Shortcut icon="podium-outline" label="Leaderboard" onPress={() => router.push('/leaderboard')} />
            </Row>

            {d.activities[0] ? (
              <>
                <SectionTitle title="Latest activity" action="History" onAction={() => router.push('/activities')} />
                <ActivityCard a={d.activities[0]} showUser={false} />
              </>
            ) : (
              <Card><Empty icon="walk-outline" title="Your first activity awaits" body="Hit Start Activity and SKYRO will track your route, pace and calories." /></Card>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function HeroStat({ icon, color, value, unit }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; value: string; unit: string }) {
  return (
    <Row gap={2}>
      <Ionicons name={icon} size={16} color={color} />
      <T v="h2" color="#fff" style={{ fontVariant: ['tabular-nums'] }}>{value}</T>
      <T v="small" color="#ffffff99">{unit}</T>
    </Row>
  );
}

function Shortcut({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress(): void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, paddingVertical: space(4), borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name={icon} size={22} color={c.primary} />
      <T v="small" style={{ fontWeight: '700' }}>{label}</T>
    </Pressable>
  );
}

function Feed({ header }: { header: React.ReactNode }) {
  const { c } = useTheme();
  const feed = useFeed();
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={(a) => a.id}
      renderItem={({ item }) => <View style={{ paddingHorizontal: space(4) }}><ActivityCard a={item} /></View>}
      ItemSeparatorComponent={() => <View style={{ height: space(4) }} />}
      ListHeaderComponent={<View style={{ gap: space(4), marginBottom: space(4) }}>{header}<Suggested /></View>}
      ListEmptyComponent={feed.isLoading ? <Loading /> : feed.error ? <View style={{ padding: space(4) }}><ErrorNote error={feed.error} onRetry={() => feed.refetch()} /></View> : <Empty icon="people-outline" title="Your feed is quiet" body="Follow friends to see their workouts here." />}
      ListFooterComponent={feed.isFetchingNextPage ? <Loading /> : <View style={{ height: 130 }} />}
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => { feed.refetch(); }} tintColor={c.primary} />}
      initialNumToRender={4}
      windowSize={7}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
    />
  );
}

function Suggested() {
  const { c } = useTheme();
  const people = useSuggested().data ?? [];
  if (!people.length) return null;
  return (
    <View style={{ gap: space(3) }}>
      <T v="h3" style={{ paddingHorizontal: space(4) }}>People to follow</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(4) }}>
        {people.map((p) => <PersonCard key={p.id} p={p} />)}
      </ScrollView>
      <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: space(4) }} />
    </View>
  );
}

function PersonCard({ p }: { p: Profile }) {
  const { c } = useTheme();
  const router = useRouter();
  const follow = useFollow(p.id);
  const [done, setDone] = useState(false);
  return (
    <Card onPress={() => router.push(`/user/${p.id}`)} style={{ width: 150, alignItems: 'center', gap: space(2) }}>
      <Avatar name={p.full_name ?? p.username} uri={p.avatar_url} size={56} />
      <T v="h3" numberOfLines={1}>{p.full_name ?? p.username}</T>
      <T v="small" color={c.muted} numberOfLines={1}>@{p.username}</T>
      <Button title={done ? (p.visibility === 'public' ? 'Following' : 'Requested') : 'Follow'} size="md" variant={done ? 'secondary' : 'primary'}
        onPress={() => { setDone(true); follow.mutate(true); }} disabled={done} style={{ alignSelf: 'stretch' }} />
    </Card>
  );
}
