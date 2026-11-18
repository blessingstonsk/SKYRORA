import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { challengeIcon, daysLeft } from '@/components/challenge-card';
import { LeaderList } from '@/components/leader-list';
import { Button, Card, Empty, Header, Loading, ProgressBar, Row, Screen, T } from '@/components/ui';
import { api } from '@/data';
import { qk, useChallenge, useChallengeBoard, useMe } from '@/data/hooks';
import { shortDate } from '@/lib/format';
import { radius, space, useTheme } from '@/theme';

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const qc = useQueryClient();
  const q = useChallenge(id);
  const board = useChallengeBoard(id);
  const me = useMe().data;
  const [busy, setBusy] = useState(false);
  const ch = q.data;

  if (q.isLoading) return <Screen header={<Header />}><Loading /></Screen>;
  if (!ch) return <Screen header={<Header />}><Empty icon="trophy-outline" title="Challenge not found" /></Screen>;

  const joined = ch.my_progress != null;
  const pct = joined ? Math.min(100, ((ch.my_progress ?? 0) / ch.target_value) * 100) : 0;
  const ended = new Date(ch.ends_at) < new Date();
  const done = !!ch.my_completed_at;

  const toggle = async () => {
    setBusy(true);
    try {
      if (joined) await api.leaveChallenge(ch.id);
      else await api.joinChallenge(ch.id);
      await Promise.all([qc.invalidateQueries({ queryKey: qk.challenges }), qc.invalidateQueries({ queryKey: qk.challengeBoard(id) })]);
    } catch (e) {
      Alert.alert('Challenge', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const leave = () => Alert.alert('Leave challenge?', 'Your progress will no longer count toward this challenge.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: toggle },
  ]);

  return (
    <Screen header={<Header title="Challenge" right={<Button title="Invite" variant="ghost" size="md" onPress={() => Share.share({ message: `Join me in the ${ch.title} challenge on SKYRO!` })} />} />} bottomInset={false}>
      <LinearGradient colors={[ch.accent, ch.accent + '33']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: space(5), gap: space(3) }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#00000033', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={challengeIcon(ch)} size={28} color="#fff" />
        </View>
        <T v="h1" color="#fff">{ch.title}</T>
        <T v="body" color="#ffffffdd">{ch.description}</T>
        <Row gap={4}>
          <Row gap={1}><Ionicons name="calendar-outline" size={14} color="#fff" /><T v="small" color="#fff">{shortDate(ch.starts_at)} – {shortDate(ch.ends_at)}</T></Row>
          <Row gap={1}><Ionicons name="people-outline" size={14} color="#fff" /><T v="small" color="#fff">{ch.participant_count} athletes</T></Row>
        </Row>
      </LinearGradient>

      {joined ? (
        <Card style={{ gap: space(3) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="h3">{done ? 'Challenge complete! 🏅' : 'Your progress'}</T>
            <T v="small" color={ended ? c.muted : c.primary} style={{ fontWeight: '800' }}>{daysLeft(ch)}</T>
          </Row>
          <Row gap={1} style={{ alignItems: 'baseline' }}>
            <T v="hero">{(ch.my_progress ?? 0).toLocaleString()}</T>
            <T v="h3" color={c.muted}>/ {ch.target_value.toLocaleString()} {ch.unit}</T>
          </Row>
          <ProgressBar pct={pct} color={ch.accent} height={12} />
          <T v="small" color={c.muted}>
            {done ? 'Badge awarded — see it on your profile.' : `${Math.max(0, ch.target_value - (ch.my_progress ?? 0)).toLocaleString()} ${ch.unit} to go`}
          </T>
        </Card>
      ) : null}

      {!ended ? (
        joined ? <Button title="Leave challenge" variant="ghost" onPress={leave} loading={busy} /> : <Button title="Join challenge" icon="add" onPress={toggle} loading={busy} />
      ) : <Card><T v="body" color={c.muted}>This challenge has ended.</T></Card>}

      <T v="h2">Leaderboard</T>
      {board.isLoading ? <Loading /> : <LeaderList rows={board.data ?? []} unit={ch.unit} meId={me?.profile.id} />}
      <T v="small" color={c.faint} center>Only athletes who allow leaderboard visibility are shown.</T>
    </Screen>
  );
}
