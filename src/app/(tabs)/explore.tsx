import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { ActivityCard } from '@/components/activity-card';
import { ChallengeCard } from '@/components/challenge-card';
import { RoutePreview } from '@/components/route-preview';
import { ACTIVITY_COLORS, ActivityIcon, Avatar, Card, Chip, Empty, Loading, Row, Screen, SectionTitle, T, type MciName } from '@/components/ui';
import { api } from '@/data';
import { useChallenges, useNearby, useRoutes } from '@/data/hooks';
import { ACTIVITY_META, duration, km, relativeTime } from '@/lib/format';
import type { ActivityType, Route } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

const FILTERS: (ActivityType | 'all')[] = ['all', 'run', 'ride', 'walk', 'hike'];

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export default function Explore() {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const term = useDebounced(q.trim());
  const type = filter === 'all' ? undefined : filter;

  return (
    <Screen>
      <View style={{ gap: space(3), marginTop: space(2) }}>
        <T v="h1">Explore</T>
        <Row gap={2} style={{ backgroundColor: c.surface2, borderRadius: radius.pill, paddingHorizontal: 16, height: 48 }}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search people, activities, routes, challenges" placeholderTextColor={c.faint}
            style={[{ flex: 1, color: c.text, fontSize: 15, height: 48 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} returnKeyType="search" autoCapitalize="none" />
          {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={c.muted} /></Pressable> : null}
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
          {FILTERS.map((f) => (
            <Chip key={f} label={f === 'all' ? 'All' : ACTIVITY_META[f].label} icon={f === 'all' ? 'apps' : (ACTIVITY_META[f].icon as MciName)} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </View>
      {term.length >= 2 ? <SearchResults term={term} /> : <Discover type={type} />}
    </Screen>
  );
}

function Discover({ type }: { type?: ActivityType }) {
  const { c } = useTheme();
  const router = useRouter();
  const routes = useRoutes(type);
  const nearby = useNearby(type);
  const challenges = useChallenges();
  const active = (challenges.data ?? []).filter((ch) => new Date(ch.ends_at) > new Date());

  return (
    <>
      <SectionTitle title="Community challenges" action="See all" onAction={() => router.push('/challenges')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }} style={{ marginHorizontal: -space(4) }}>
        <View style={{ width: space(1) }} />
        {active.map((ch) => <ChallengeCard key={ch.id} ch={ch} compact />)}
        <View style={{ width: space(1) }} />
      </ScrollView>

      <SectionTitle title={type ? `Popular ${ACTIVITY_META[type].label.toLowerCase()} routes` : 'Popular routes'} />
      {routes.isLoading ? <Loading /> : (routes.data ?? []).length === 0 ? <Empty icon="map-outline" title="No routes yet" /> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }} style={{ marginHorizontal: -space(4) }}>
          <View style={{ width: space(1) }} />
          {(routes.data ?? []).map((r) => <RouteCard key={r.id} r={r} />)}
          <View style={{ width: space(1) }} />
        </ScrollView>
      )}

      <SectionTitle title="Trending nearby" />
      {nearby.isLoading ? <Loading /> : (nearby.data ?? []).length === 0 ? (
        <Card><Empty icon="location-outline" title="Nothing nearby yet" body="Public activities from athletes around you appear here." /></Card>
      ) : (
        <>
          {(nearby.data ?? []).slice(0, 3).map((a) => <ActivityCard key={a.id} a={a} />)}
          <Card style={{ gap: 2 }}>
            {(nearby.data ?? []).slice(3, 10).map((a) => (
              <Pressable key={a.id} onPress={() => router.push(`/activity/${a.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2) }}>
                <ActivityIcon type={a.type} size={36} />
                <View style={{ flex: 1 }}>
                  <T v="h3" numberOfLines={1}>{a.title}</T>
                  <T v="small" color={c.muted}>{a.profile?.full_name} · {relativeTime(a.started_at)}</T>
                </View>
                <T v="h3">{a.distance_m ? `${km(a.distance_m, 1)} km` : duration(a.moving_time_s, true)}</T>
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function RouteCard({ r }: { r: Route }) {
  const { c } = useTheme();
  return (
    <View style={{ width: 240, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
      <RoutePreview polyline={r.map_polyline} height={130} color={ACTIVITY_COLORS[r.type]} />
      <View style={{ padding: space(3), gap: 4 }}>
        <T v="h3" numberOfLines={1}>{r.name}</T>
        <T v="small" color={c.muted}>{km(r.distance_m, 1)} km · {Math.round(r.elevation_gain_m)} m ↑ · {r.region_label}</T>
        <Row gap={1}><Ionicons name="people" size={12} color={c.faint} /><T v="small" color={c.faint}>{r.times_completed.toLocaleString()} athletes</T></Row>
      </View>
    </View>
  );
}

function SearchResults({ term }: { term: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const people = useQuery({ queryKey: ['search', 'people', term], queryFn: () => api.searchPeople(term) });
  const acts = useQuery({ queryKey: ['search', 'acts', term], queryFn: () => api.searchActivities(term) });
  const routes = useRoutes(undefined, term);
  const challenges = useChallenges();
  const chal = (challenges.data ?? []).filter((ch) => ch.title.toLowerCase().includes(term.toLowerCase()));
  const loading = people.isLoading || acts.isLoading;
  const none = !loading && !people.data?.length && !acts.data?.length && !routes.data?.length && !chal.length;

  if (loading) return <Loading />;
  if (none) return <Empty icon="search" title={`No results for “${term}”`} body="Try a name, username, route or challenge." />;
  return (
    <>
      {people.data?.length ? (
        <Card style={{ gap: 2 }}>
          <T v="label" color={c.muted}>People</T>
          {people.data.map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/user/${p.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2) }}>
              <Avatar name={p.full_name ?? p.username} uri={p.avatar_url} size={40} />
              <View style={{ flex: 1 }}>
                <T v="h3">{p.full_name ?? p.username}</T>
                <T v="small" color={c.muted}>@{p.username}{p.visibility === 'private' ? ' · private' : ''}</T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.faint} />
            </Pressable>
          ))}
        </Card>
      ) : null}
      {chal.length ? <><T v="label" color={c.muted}>Challenges</T>{chal.map((ch) => <ChallengeCard key={ch.id} ch={ch} />)}</> : null}
      {routes.data?.length ? <><T v="label" color={c.muted}>Routes</T>{routes.data.map((r) => <RouteCard key={r.id} r={r} />)}</> : null}
      {acts.data?.length ? <><T v="label" color={c.muted}>Activities</T>{acts.data.map((a) => <ActivityCard key={a.id} a={a} />)}</> : null}
    </>
  );
}
