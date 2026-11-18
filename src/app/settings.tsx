import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Switch, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { Card, Chip, Header, ListItem, Row, Screen, Segmented, T } from '@/components/ui';
import { api, VISIBILITY_LABEL } from '@/data';
import { qk, useMe, useNotificationPrefs } from '@/data/hooks';
import type { NotificationPrefs, Visibility } from '@/lib/types';
import { space, useTheme, type ThemeMode } from '@/theme';

const NOTIF: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'follow_requests', label: 'Follow requests' }, { key: 'new_followers', label: 'New followers' },
  { key: 'likes', label: 'Likes' }, { key: 'comments', label: 'Comments' },
  { key: 'challenges', label: 'Challenge invites & completions' }, { key: 'records', label: 'Personal records & badges' },
  { key: 'streaks', label: 'Workout streaks' },
];

export default function Settings() {
  const { c, mode, setMode } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe().data;
  const prefs = useNotificationPrefs().data;

  const patchProfile = async (p: Parameters<typeof api.updateProfile>[0]) => {
    await api.updateProfile(p);
    qc.invalidateQueries({ queryKey: qk.me });
  };
  const patchPrivate = async (p: Parameters<typeof api.updatePrivate>[0]) => {
    await api.updatePrivate(p);
    qc.invalidateQueries({ queryKey: qk.me });
  };
  const patchPrefs = async (p: Partial<NotificationPrefs>) => {
    qc.setQueryData(qk.prefs, { ...prefs, ...p });
    await api.updateNotificationPrefs(p);
  };

  const signOut = () => Alert.alert('Sign out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => api.signOut() }]);
  const deleteAccount = () => {
    const go = () => api.deleteAccount().catch((e) => Alert.alert('Could not delete account', String(e?.message ?? e)));
    const msg = 'This permanently deletes your profile, activities, routes, photos, goals and weight history. This cannot be undone.';
    Alert.alert('Delete account?', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete forever', style: 'destructive', onPress: go }]);
  };

  return (
    <Screen header={<Header title="Settings" />} bottomInset={false}>
      <Section title="Appearance">
        <Segmented options={[{ key: 'dark', label: 'Dark' }, { key: 'light', label: 'Light' }, { key: 'system', label: 'System' }]} value={mode} onChange={(m: ThemeMode) => setMode(m)} />
      </Section>

      <Section title="Account">
        <ListItem icon="person-circle-outline" title="Edit profile" subtitle="Photo, name, body metrics, goal" onPress={() => router.push('/edit-profile')} />
        <ListItem icon="mail-outline" title="Email" subtitle={me?.email ?? '—'} />
      </Section>

      <Section title="Privacy">
        <T v="label" color={c.muted}>Profile visibility</T>
        <Row gap={2} wrap>
          {(['public', 'followers', 'private'] as Visibility[]).map((v) => (
            <Chip key={v} label={v === 'public' ? 'Public' : v === 'followers' ? 'Followers only' : 'Private'} active={me?.profile.visibility === v} onPress={() => patchProfile({ visibility: v })} />
          ))}
        </Row>
        <T v="small" color={c.faint}>
          {me?.profile.visibility === 'public' ? 'Anyone on SKYRO can see your public activities and follow you.'
            : me?.profile.visibility === 'followers' ? 'Only approved followers see your activities. New followers must be approved.'
            : 'Only you can see your activities. You are hidden from leaderboards and Explore.'}
        </T>
        <Toggle label="Show me on leaderboards" value={!!me?.profile.show_in_leaderboards} onChange={(v) => patchProfile({ show_in_leaderboards: v })} />
        <Toggle label="Hide start & end of routes" sub="Blurs where your activities begin and end (e.g. home)" value={!!me?.private.hide_route_ends} onChange={(v) => patchPrivate({ hide_route_ends: v })} />
        {me?.private.hide_route_ends ? (
          <View style={{ gap: 8 }}>
            <T v="label" color={c.muted}>Hidden distance</T>
            <Row gap={2}>
              {[100, 200, 400, 800].map((m) => <Chip key={m} label={`${m} m`} active={me.private.route_trim_m === m} onPress={() => patchPrivate({ route_trim_m: m })} />)}
            </Row>
          </View>
        ) : null}
        <T v="small" color={c.faint}>New activities default to “{VISIBILITY_LABEL.public}”. You can change each activity&apos;s visibility when saving or editing it. Exact GPS points are only ever visible to you.</T>
      </Section>

      <Section title="Notifications">
        {NOTIF.map((n) => <Toggle key={n.key} label={n.label} value={prefs ? prefs[n.key] : true} onChange={(v) => patchPrefs({ [n.key]: v })} />)}
      </Section>

      <Section title="Session">
        <ListItem icon="log-out-outline" title="Sign out" onPress={signOut} />
        <ListItem icon="trash-outline" title="Delete account" subtitle="Permanently remove all your data" danger onPress={deleteAccount} />
      </Section>

      <T v="small" color={c.faint} center>
        SKYRO v1.0 · {api.mode === 'demo' ? 'Demo mode (on-device data)' : 'Connected to Supabase'}{'\n'}Calorie and step figures are estimates. SKYRO is not a medical device and does not give medical advice.
      </T>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space(2) }}>
      <T v="label" color={c.muted} style={{ marginLeft: 4 }}>{title}</T>
      <Card style={{ gap: space(3) }}>{children}</Card>
    </View>
  );
}

function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange(v: boolean): void }) {
  const { c } = useTheme();
  return (
    <Row>
      <View style={{ flex: 1 }}>
        <T v="body" style={{ fontWeight: '600' }}>{label}</T>
        {sub ? <T v="small" color={c.muted}>{sub}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.surface3 }} accessibilityLabel={label} />
    </Row>
  );
}
