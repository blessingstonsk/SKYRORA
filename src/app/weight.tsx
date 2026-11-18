import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { LineChart } from '@/components/charts';
import { Button, Card, Empty, Field, Header, Loading, ProgressBar, Row, Screen, Segmented, T } from '@/components/ui';
import { api } from '@/data';
import { qk, useGoals, useWeights } from '@/data/hooks';
import { dayKey, shortDate } from '@/lib/format';
import { weightSummary } from '@/lib/stats';
import { numberIn } from '@/lib/validation';
import { space, useTheme } from '@/theme';

type Range = '30' | '90' | '180' | 'all';

export default function Weight() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const logs = useWeights();
  const goals = useGoals();
  const goal = goals.data?.find((g) => g.type === 'weight_loss' || g.type === 'weight_gain') ?? null;
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('90');
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const s = useMemo(() => weightSummary(logs.data ?? [], goal), [logs.data, goal]);
  const series = useMemo(() => {
    if (range === 'all') return s.series;
    const from = dayKey(now - Number(range) * 86400000);
    return s.series.filter((p) => p.date >= from);
  }, [s.series, range, now]);

  const add = async () => {
    const kg = numberIn(input, 20, 400);
    if (kg == null) return setError('Enter a weight between 20 and 400 kg');
    setError(null);
    setBusy(true);
    try {
      await api.addWeight(Math.round(kg * 10) / 10, dayKey(new Date()));
      setInput('');
      await Promise.all([qc.invalidateQueries({ queryKey: qk.weights }), qc.invalidateQueries({ queryKey: qk.me })]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = (id: string, label: string) =>
    Alert.alert('Delete entry?', label, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api.deleteWeight(id); qc.invalidateQueries({ queryKey: qk.weights }); } },
    ]);

  const lost = s.totalChange < 0;
  const fmt = (n: number | null, unit = 'kg') => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(Math.abs(n) < 1 ? 2 : 1)} ${unit}`);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Header title="Weight" />} bottomInset={false}>
        <Card style={{ gap: space(3) }}>
          <T v="label" color={c.muted}>Log today&apos;s weight</T>
          <Row gap={3} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field value={input} onChangeText={setInput} keyboardType="decimal-pad" placeholder={s.latest ? s.latest.toFixed(1) : '75.0'} error={error} maxLength={5} onSubmitEditing={add} />
            </View>
            <Button title="Save" onPress={add} loading={busy} style={{ minWidth: 100 }} />
          </Row>
        </Card>

        {logs.isLoading ? <Loading /> : !s.series.length ? (
          <Empty icon="scale-outline" title="No weigh-ins yet" body="Log your weight regularly — same time of day works best — to see your trend." />
        ) : (
          <>
            <Card style={{ gap: space(4) }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <T v="label" color={c.muted}>Current</T>
                  <Row gap={1} style={{ alignItems: 'baseline' }}>
                    <T v="hero">{s.latest?.toFixed(1)}</T>
                    <T v="h3" color={c.muted}>kg</T>
                  </Row>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T v="label" color={c.muted}>Since start</T>
                  <T v="h2" color={lost ? c.success : s.totalChange > 0 ? c.warm : c.text}>{fmt(s.totalChange)}</T>
                  <T v="small" color={c.faint}>from {s.start?.toFixed(1)} kg</T>
                </View>
              </Row>
              <Segmented options={[{ key: '30', label: '30D' }, { key: '90', label: '3M' }, { key: '180', label: '6M' }, { key: 'all', label: 'All' }]} value={range} onChange={setRange} />
              <LineChart data={series.map((p) => ({ label: shortDate(p.date), value: p.weight }))} goal={goal?.target_value} format={(v) => `${v.toFixed(1)} kg`} height={200} />
            </Card>

            <Row gap={3}>
              <Tile label="Weekly avg" value={fmt(s.weeklyAvgChange)} />
              <Tile label="Last 30 days" value={fmt(s.monthChange)} />
            </Row>

            {goal ? (
              <Card style={{ gap: space(3) }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="h3">{goal.title}</T>
                  <T v="h3" color={c.primary}>{s.pctToGoal ?? 0}%</T>
                </Row>
                <ProgressBar pct={s.pctToGoal ?? 0} height={10} />
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="small" color={c.muted}>Start {goal.start_value ?? s.start} kg</T>
                  <T v="small" color={c.muted}>Target {goal.target_value} kg</T>
                </Row>
                <Row gap={2}>
                  <Ionicons name="calendar-outline" size={16} color={c.muted} />
                  <T v="small" color={c.muted} style={{ flex: 1 }}>
                    {s.etaDate
                      ? `At your current trend you could reach ${goal.target_value} kg around ${s.etaDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                      : 'Keep logging — an estimated target date appears once there is a clear trend toward your goal.'}
                  </T>
                </Row>
              </Card>
            ) : (
              <Card onPress={() => router.push('/goals')}>
                <Row><Ionicons name="flag-outline" size={20} color={c.primary} /><T v="h3" style={{ flex: 1 }}>Set a weight goal</T><Ionicons name="chevron-forward" size={18} color={c.faint} /></Row>
              </Card>
            )}

            <Card style={{ gap: 0 }} padded={false}>
              <Row style={{ paddingHorizontal: space(4), paddingVertical: space(3) }}>
                <T v="label" color={c.muted} style={{ flex: 1 }}>Date</T>
                <T v="label" color={c.muted} style={{ width: 80, textAlign: 'right' }}>Weight</T>
                <T v="label" color={c.muted} style={{ width: 80, textAlign: 'right' }}>Change</T>
              </Row>
              {[...s.series].reverse().slice(0, 30).map((p) => {
                const log = logs.data!.find((l) => l.logged_on === p.date)!;
                return (
                  <Pressable key={p.date} onLongPress={() => remove(log.id, `${shortDate(p.date)} · ${p.weight} kg`)}
                    style={{ flexDirection: 'row', paddingHorizontal: space(4), paddingVertical: space(3), borderTopWidth: 1, borderTopColor: c.border }}>
                    <T v="body" style={{ flex: 1 }}>{new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</T>
                    <T v="h3" style={{ width: 80, textAlign: 'right' }}>{p.weight.toFixed(1)}</T>
                    <T v="small" style={{ width: 80, textAlign: 'right', fontWeight: '700' }} color={p.change < 0 ? c.success : p.change > 0 ? c.warm : c.muted}>
                      {p.change === 0 ? '–' : `${p.change > 0 ? '+' : ''}${p.change.toFixed(1)}`}
                    </T>
                  </Pressable>
                );
              })}
            </Card>
            <T v="small" color={c.faint} center>Long-press an entry to delete it. SKYRO shows trends only and does not provide medical advice — talk to a healthcare professional about weight goals.</T>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <T v="label" color={c.muted}>{label}</T>
      <T v="h2" style={{ marginTop: 4 }}>{value}</T>
    </Card>
  );
}
