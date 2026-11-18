import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { VisibilityPicker, TitleFields } from '@/components/activity-editor';
import { Comparison, RecordBadges, SetsTable, Splits, StatsGrid } from '@/components/activity-stats';
import { RouteMap } from '@/components/route-map';
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Header, IconButton, Loading, Row, Screen, T } from '@/components/ui';
import { api, VISIBILITY_LABEL } from '@/data';
import {
  invalidateActivityData, qk, useActivity, useActivityPoints, useAddComment, useComments, useLike, useMe, useMyActivities,
} from '@/data/hooks';
import { ACTIVITY_META, dateTime, duration, km, relativeTime } from '@/lib/format';
import { recordsSetBy } from '@/lib/stats';
import type { Visibility } from '@/lib/types';
import { cleanText } from '@/lib/validation';
import { radius, space, useTheme } from '@/theme';

export default function ActivityDetail() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useActivity(id);
  const me = useMe().data;
  const a = q.data;
  const mine = !!a && a.user_id === me?.profile.id;
  const points = useActivityPoints(id, mine);
  const historyQ = useMyActivities().data;
  const history = useMemo(() => historyQ ?? [], [historyQ]);
  const like = useLike();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; visibility: Visibility }>({ title: '', description: '', visibility: 'public' });

  const records = useMemo(() => (a && mine ? recordsSetBy(a, history.filter((h) => h.started_at < a.started_at)) : []), [a, mine, history]);

  if (q.isLoading) return <Screen header={<Header />}><Loading /></Screen>;
  if (q.error) return <Screen header={<Header />}><ErrorNote error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!a) return <Screen header={<Header />}><Empty icon="eye-off-outline" title="Activity not available" body="It may have been deleted or made private." /></Screen>;

  const startEdit = () => {
    setForm({ title: a.title, description: a.description ?? '', visibility: a.visibility });
    setEditing(true);
  };
  const saveEdit = async () => {
    try {
      await api.updateActivity(a.id, { title: cleanText(form.title, 80) || a.title, description: cleanText(form.description, 2000) || null, visibility: form.visibility });
      setEditing(false);
      await invalidateActivityData(qc);
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : String(e));
    }
  };
  const remove = () =>
    Alert.alert('Delete activity?', 'This permanently deletes the activity, its route, photos, likes and comments.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await api.deleteActivity(a.id);
        await invalidateActivityData(qc);
        router.back();
      } },
    ]);
  const menu = () =>
    Alert.alert(a.title, undefined, [
      { text: 'Edit', onPress: startEdit },
      { text: 'Delete', style: 'destructive', onPress: remove },
      { text: 'Cancel', style: 'cancel' },
    ]);
  const share = () => Share.share({ message: `${a.title} — ${a.distance_m ? km(a.distance_m) + ' km in ' : ''}${duration(a.moving_time_s, true)} on SKYRO 🚀` }).catch(() => {});
  const routePoints = mine && points.data?.length ? points.data : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <Screen
        bottomInset={false}
        header={<Header title={ACTIVITY_META[a.type].label} right={mine ? <IconButton icon="ellipsis-horizontal" label="Activity options" onPress={menu} /> : <IconButton icon="share-outline" label="Share" onPress={share} />} />}>
        <Pressable onPress={() => a.profile && router.push(`/user/${a.profile.id}`)}>
          <Row>
            <Avatar name={a.profile?.full_name ?? a.profile?.username} uri={a.profile?.avatar_url} size={44} />
            <View style={{ flex: 1 }}>
              <T v="h3">{a.profile?.full_name ?? a.profile?.username}</T>
              <T v="small" color={c.muted}>{dateTime(a.started_at)}</T>
            </View>
            {a.visibility !== 'public' ? <Badge label={VISIBILITY_LABEL[a.visibility]} color={c.muted} /> : null}
          </Row>
        </Pressable>

        {editing ? (
          <Card style={{ gap: space(4) }}>
            <TitleFields title={form.title} description={form.description} onTitle={(title) => setForm({ ...form, title })} onDescription={(description) => setForm({ ...form, description })} />
            <VisibilityPicker value={form.visibility} onChange={(visibility) => setForm({ ...form, visibility })} />
            <Row gap={3}>
              <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
              <Button title="Save" onPress={saveEdit} style={{ flex: 1 }} />
            </Row>
          </Card>
        ) : (
          <View style={{ gap: space(2) }}>
            <T v="h1">{a.title}</T>
            {a.description ? <T v="body" color={c.muted}>{a.description}</T> : null}
          </View>
        )}

        {a.map_polyline || routePoints ? (
          <View style={{ gap: 6 }}>
            <RouteMap polyline={a.map_polyline} points={routePoints} height={260} rounded={radius.xl} />
            {mine && routePoints ? <T v="small" color={c.faint}>Only you see the full route. Others see a privacy-trimmed version.</T> : null}
          </View>
        ) : null}
        {a.photos?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
            {a.photos.map((p) => <Image key={p} source={{ uri: p }} style={{ width: 260, height: 200, borderRadius: radius.lg }} contentFit="cover" transition={150} />)}
          </ScrollView>
        ) : null}

        <RecordBadges records={records} />
        <StatsGrid a={a} />
        {mine ? <Comparison a={a} history={history} /> : null}
        <Splits splits={a.splits ?? []} />
        <SetsTable sets={a.sets ?? []} />

        <Row gap={3}>
          <Button title={`${a.like_count} ${a.like_count === 1 ? 'like' : 'likes'}`} icon={a.liked_by_me ? 'heart' : 'heart-outline'} variant={a.liked_by_me ? 'primary' : 'secondary'}
            onPress={() => { like.mutate({ id: a.id, liked: !a.liked_by_me }); qc.setQueryData(qk.activity(a.id), { ...a, liked_by_me: !a.liked_by_me, like_count: a.like_count + (a.liked_by_me ? -1 : 1) }); }}
            size="md" style={{ flex: 1 }} />
          <Button title="Share" icon="share-outline" variant="secondary" size="md" onPress={share} style={{ flex: 1 }} />
        </Row>

        <Comments activityId={a.id} ownerId={a.user_id} autoFocus={focus === 'comment'} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Comments({ activityId, ownerId, autoFocus }: { activityId: string; ownerId: string; autoFocus?: boolean }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const me = useMe().data;
  const list = useComments(activityId);
  const add = useAddComment(activityId);
  const [text, setText] = useState('');

  const send = () => {
    const body = cleanText(text, 1000);
    if (!body) return;
    add.mutate(body, {
      onSuccess: () => setText(''),
      onError: (e) => Alert.alert('Comment not posted', e instanceof Error ? e.message : String(e)),
    });
  };
  const remove = (id: string) =>
    Alert.alert('Delete comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api.deleteComment(id); qc.invalidateQueries({ queryKey: qk.comments(activityId) }); } },
    ]);

  return (
    <Card style={{ gap: space(4) }}>
      <T v="h3">Comments {list.data?.length ? `· ${list.data.length}` : ''}</T>
      {list.isLoading ? <Loading /> : (list.data ?? []).length === 0 ? <T v="small" color={c.muted}>Be the first to cheer them on.</T> : null}
      {(list.data ?? []).map((cm) => (
        <Pressable key={cm.id} onLongPress={() => (cm.user_id === me?.profile.id || ownerId === me?.profile.id) && remove(cm.id)}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Avatar name={cm.profile?.full_name ?? cm.profile?.username} uri={cm.profile?.avatar_url} size={32} />
            <View style={{ flex: 1, backgroundColor: c.surface2, borderRadius: radius.md, padding: space(3) }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" style={{ fontWeight: '800' }}>{cm.profile?.full_name ?? cm.profile?.username}</T>
                <T v="small" color={c.faint}>{relativeTime(cm.created_at)}</T>
              </Row>
              <T v="body" style={{ marginTop: 2 }}>{cm.body}</T>
            </View>
          </Row>
        </Pressable>
      ))}
      <Row gap={2}>
        <TextInput
          autoFocus={autoFocus}
          value={text}
          onChangeText={setText}
          placeholder="Add a comment…"
          placeholderTextColor={c.faint}
          maxLength={1000}
          onSubmitEditing={send}
          returnKeyType="send"
          style={[{ flex: 1, height: 44, borderRadius: radius.pill, paddingHorizontal: 16, backgroundColor: c.surface2, color: c.text, fontSize: 15 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        />
        <IconButton icon="send" label="Send comment" onPress={send} bg={c.primary} color={c.primaryText} />
      </Row>
      {add.isPending ? <Row gap={2}><Ionicons name="time-outline" size={14} color={c.muted} /><T v="small" color={c.muted}>Posting…</T></Row> : null}
    </Card>
  );
}
