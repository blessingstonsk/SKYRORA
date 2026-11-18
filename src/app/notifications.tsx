import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';

import { Avatar, Button, Empty, Header, Loading, Row, Screen, T } from '@/components/ui';
import { api } from '@/data';
import { qk, useNotifications } from '@/data/hooks';
import { relativeTime } from '@/lib/format';
import { RECORD_META } from '@/lib/stats';
import type { AppNotification, RecordKey } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

const ICONS: Record<AppNotification['type'], [React.ComponentProps<typeof Ionicons>['name'], string]> = {
  like: ['heart', '#FF5C7A'], comment: ['chatbubble', '#4DA3FF'], new_follower: ['person-add', '#2EE6C5'],
  follow_request: ['person-add', '#7C6CFF'], challenge_invite: ['trophy', '#FFB547'], challenge_complete: ['trophy', '#3DDC84'],
  personal_record: ['flash', '#FFB547'], streak: ['flame', '#FF8A3D'], achievement: ['ribbon', '#7C6CFF'],
};

function text(n: AppNotification): string {
  const who = n.actor?.full_name ?? n.actor?.username ?? 'Someone';
  const d = n.data as Record<string, string | number | undefined>;
  switch (n.type) {
    case 'like': return `${who} liked your activity`;
    case 'comment': return `${who} commented: “${d.preview ?? ''}”`;
    case 'new_follower': return d.accepted ? `${who} accepted your follow request` : `${who} started following you`;
    case 'follow_request': return `${who} wants to follow you`;
    case 'challenge_invite': return `${who} invited you to ${d.title ?? 'a challenge'}`;
    case 'challenge_complete': return `Challenge complete: ${d.title ?? ''} 🏅`;
    case 'personal_record': return `New personal record — ${d.label ?? RECORD_META[d.record as RecordKey]?.label ?? 'PR'}!`;
    case 'streak': return `${d.days}-day streak! Keep the momentum going 🔥`;
    case 'achievement': return `Badge unlocked: ${d.title ?? ''}`;
  }
}

export default function Notifications() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useNotifications();
  const list = useMemo(() => q.data ?? [], [q.data]);

  useEffect(() => {
    // Mark as read shortly after viewing.
    if (!list.some((n) => !n.read_at)) return;
    const t = setTimeout(() => api.markRead().then(() => qc.invalidateQueries({ queryKey: qk.notifications })), 1500);
    return () => clearTimeout(t);
  }, [list, qc]);

  const open = (n: AppNotification) => {
    if (n.activity_id) router.push(`/activity/${n.activity_id}`);
    else if (n.challenge_id) router.push(`/challenge/${n.challenge_id}`);
    else if (n.actor) router.push(`/user/${n.actor.id}`);
  };
  const respond = async (n: AppNotification, accept: boolean) => {
    if (!n.actor) return;
    if (accept) await api.acceptFollow(n.actor.id);
    else await api.declineFollow(n.actor.id);
    qc.invalidateQueries({ queryKey: qk.notifications });
    qc.invalidateQueries({ queryKey: ['follow'] });
  };

  return (
    <Screen
      header={<Header title="Notifications" right={<Pressable onPress={() => router.push('/settings?section=notifications')} hitSlop={8} accessibilityLabel="Notification settings"><Ionicons name="options-outline" size={22} color={c.text} /></Pressable>} />}
      refresh={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={c.primary} />}
      bottomInset={false}>
      {q.isLoading ? <Loading /> : list.length === 0 ? <Empty icon="notifications-outline" title="You're all caught up" body="Likes, comments, follows and achievements show up here." /> : (
        <View style={{ gap: space(2) }}>
          {list.map((n) => {
            const [icon, color] = ICONS[n.type];
            return (
              <Pressable key={n.id} onPress={() => open(n)}
                style={({ pressed }) => ({ flexDirection: 'row', gap: space(3), padding: space(3), borderRadius: radius.lg, backgroundColor: n.read_at ? 'transparent' : c.primary + '10', opacity: pressed ? 0.8 : 1 })}>
                <View>
                  {n.actor ? <Avatar name={n.actor.full_name ?? n.actor.username} uri={n.actor.avatar_url} size={44} /> : (
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={icon} size={20} color={color} />
                    </View>
                  )}
                  {n.actor ? (
                    <View style={{ position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.bg }}>
                      <Ionicons name={icon} size={10} color="#fff" />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T v="body">{text(n)}</T>
                  <T v="small" color={c.faint}>{relativeTime(n.created_at)}</T>
                  {n.type === 'follow_request' ? (
                    <Row gap={2} style={{ marginTop: 4 }}>
                      <Button title="Accept" size="md" onPress={() => respond(n, true)} />
                      <Button title="Decline" size="md" variant="secondary" onPress={() => respond(n, false)} />
                    </Row>
                  ) : null}
                </View>
                {!n.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 6 }} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
