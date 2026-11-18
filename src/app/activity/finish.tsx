import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { Comparison, RecordBadges, Splits, StatsGrid } from '@/components/activity-stats';
import { PhotoStrip, TitleFields, VisibilityPicker } from '@/components/activity-editor';
import { RouteMap } from '@/components/route-map';
import { ActivityIcon, Button, Card, Row, Screen, T } from '@/components/ui';
import { invalidateActivityData, useMe, useMyActivities } from '@/data/hooks';
import { saveDraft } from '@/data/outbox';
import { ACTIVITY_META, dateTime } from '@/lib/format';
import { recordsSetBy } from '@/lib/stats';
import { cleanText } from '@/lib/validation';
import type { Activity } from '@/lib/types';
import { useRecorder } from '@/state/recorder';
import { radius, space, useTheme } from '@/theme';

export default function Finish() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const draft = useRecorder((s) => s.draft);
  const update = useRecorder((s) => s.updateDraft);
  const discard = useRecorder((s) => s.discard);
  const historyQ = useMyActivities().data;
  const history = useMemo(() => historyQ ?? [], [historyQ]);
  const me = useMe().data;
  const [busy, setBusy] = useState(false);

  const asActivity = useMemo(() => (draft ? ({ ...draft, id: 'draft', user_id: 'me', created_at: draft.started_at, like_count: 0, comment_count: 0, map_polyline: null, region_lat: null, region_lng: null } as unknown as Activity) : null), [draft]);
  const records = useMemo(() => (asActivity ? recordsSetBy(asActivity, history) : []), [asActivity, history]);

  if (!draft || !asActivity) return <Redirect href="/" />;

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveDraft({ ...draft, title: cleanText(draft.title, 80) || ACTIVITY_META[draft.type].label, description: cleanText(draft.description ?? '', 2000) || null });
      await invalidateActivityData(qc);
      // Navigate first, then clear the recorder (clearing first would trigger the no-draft redirect).
      if (saved) router.replace(`/activity/${saved.id}`);
      else {
        router.replace('/');
        Alert.alert('Saved offline', 'Your activity is stored on this device and will upload automatically when you are back online.');
      }
      setTimeout(discard, 0);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDiscard = () =>
    Alert.alert('Discard activity?', 'This recording will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { discard(); router.replace('/'); } },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen bottomInset={false}>
        <View style={{ alignItems: 'center', gap: space(2), marginTop: space(4) }}>
          <ActivityIcon type={draft.type} size={56} />
          <T v="h1" center>Great {ACTIVITY_META[draft.type].label.toLowerCase()}! 🎉</T>
          <T v="small" color={c.muted}>{dateTime(draft.started_at)}</T>
        </View>

        {draft.points.length > 1 ? <RouteMap points={draft.points} height={220} rounded={radius.xl} /> : null}
        <RecordBadges records={records} />
        <StatsGrid a={draft} />
        <Comparison a={asActivity} history={history} />
        <Splits splits={draft.splits} />

        <Card style={{ gap: space(4) }}>
          <TitleFields title={draft.title} description={draft.description ?? ''} onTitle={(title) => update({ title })} onDescription={(description) => update({ description })} />
          <PhotoStrip uris={draft.photo_uris} onChange={(photo_uris) => update({ photo_uris })} />
          <VisibilityPicker value={draft.visibility} onChange={(visibility) => update({ visibility })} />
          {draft.points.length > 1 ? (
            <Row gap={2}>
              <Ionicons name="shield-checkmark" size={16} color={c.primary} />
              <T v="small" color={c.muted} style={{ flex: 1 }}>
                {me?.private.hide_route_ends ? `The first and last ${me.private.route_trim_m} m of your route are hidden from others.` : 'Your full route will be visible. Enable start/end hiding in Privacy settings.'}
              </T>
            </Row>
          ) : null}
        </Card>

        <Button title="Save activity" icon="checkmark" onPress={save} loading={busy} />
        <Button title="Discard" variant="ghost" onPress={confirmDiscard} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
